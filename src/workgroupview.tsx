import { useEffect, useRef, useState } from "react";
import type { Deck, ReviewEvent } from "./types";
import type { LifeState } from "./life";
import type { ParsedCard } from "./import";
import { uid } from "./storage";
import { IconUsers, IconArrowLeft, IconTrash, IconDownload, IconUpload, IconCheck } from "./icons";
import {
  type Workgroup, type SharedFolder, type SharedItem, type Profile, type GroupEvent, type ChatMessage,
  loadGroups, saveGroups, loadProfile, saveProfile,
  createGroup, encodeInvite, decodeInvite, joinGroup,
  googleCalendarUrl, eventToICS,
} from "./workgroup";
import { searchGifs, gifSearchAvailable, type GifResult } from "./gifs";
import { makeSyncId, pushSnapshot, joinSyncChannel, absorbRemote, type SyncState } from "./sync";
import {
  computeMonthly, monthKeyOf, prevMonthKey, rankByPoints, rankByConstancy, MEDALS,
} from "./leaderboard";

/**
 * Work Groups — create a study group, invite people with a single link
 * (Discord-style: paste it, you're in) and share folders of study material:
 * notes, links and whole flashcard decks.
 *
 * Local-first: snapshots travel via invite links and export/import bundles,
 * and converge through union-merge. Deleting an item removes it from YOUR
 * copy; a later merge from a member who still has it will bring it back
 * (no tombstones yet — documented limitation).
 */
export function WorkgroupView({
  decks,
  events,
  life,
  onImportDeck,
}: {
  decks: Deck[];
  events: ReviewEvent[];
  life: LifeState;
  onImportDeck: (name: string, cards: ParsedCard[]) => void;
}) {
  const [groups, setGroups] = useState<Workgroup[]>(() => loadGroups());
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [openId, setOpenId] = useState<string | null>(null);

  const persist = (next: Workgroup[]) => {
    setGroups(next);
    saveGroups(next);
  };

  if (!profile) {
    return (
      <main>
        <h2>Work Groups</h2>
        <NamePrompt onSave={(name) => setProfile(saveProfile(name))} />
      </main>
    );
  }

  const open = openId ? groups.find((g) => g.id === openId) ?? null : null;

  return (
    <main>
      {open ? (
        <GroupDetail
          group={open}
          profile={profile}
          decks={decks}
          events={events}
          life={life}
          onBack={() => setOpenId(null)}
          onChange={(g) => persist(groups.map((x) => (x.id === g.id ? g : x)))}
          onLeave={() => {
            persist(groups.filter((x) => x.id !== open.id));
            setOpenId(null);
          }}
          onImportDeck={onImportDeck}
        />
      ) : (
        <GroupList
          groups={groups}
          profile={profile}
          onOpen={setOpenId}
          onCreate={(name, desc) => {
            const g = createGroup(name, desc, profile);
            persist([...groups, g]);
            setOpenId(g.id);
          }}
          onJoin={(snapshot) => {
            persist(joinGroup(groups, snapshot, profile));
            setOpenId(snapshot.id);
          }}
        />
      )}
    </main>
  );
}

/* ─── first-run display name ─────────────────────────────────────────────── */

function NamePrompt({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <section className="card-box">
      <p className="hint">
        Pick a display name — it's how group members will see you. Stored only
        on this device.
      </p>
      <div className="row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name…"
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name)}
        />
        <button className="primary" disabled={!name.trim()} onClick={() => onSave(name)}>
          Continue
        </button>
      </div>
    </section>
  );
}

/* ─── group list + create + join ─────────────────────────────────────────── */

function GroupList({
  groups,
  profile,
  onOpen,
  onCreate,
  onJoin,
}: {
  groups: Workgroup[];
  profile: Profile;
  onOpen: (id: string) => void;
  onCreate: (name: string, desc: string) => void;
  onJoin: (snapshot: Workgroup) => void;
}) {
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [joinError, setJoinError] = useState(false);

  const tryJoin = () => {
    const snap = decodeInvite(invite);
    if (!snap) { setJoinError(true); return; }
    setJoinError(false);
    setInvite("");
    onJoin(snap);
  };

  return (
    <>
      <h2>Work Groups</h2>
      <p className="hint">
        Study together: one invite link to join, shared folders for notes,
        links and whole decks. Signed in as <strong>{profile.name}</strong>.
      </p>

      <section className="card-box">
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New group name…"
            onKeyDown={(e) => e.key === "Enter" && name.trim() && (onCreate(name, ""), setName(""))}
          />
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => { onCreate(name, ""); setName(""); }}
          >
            Create group
          </button>
        </div>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <input
            value={invite}
            onChange={(e) => { setInvite(e.target.value); setJoinError(false); }}
            placeholder="Paste an invite link (memora://join/…)"
          />
          <button className="ghost" disabled={!invite.trim()} onClick={tryJoin}>
            Join
          </button>
        </div>
        {joinError && <p className="error-text">That doesn't look like a valid invite link.</p>}
      </section>

      {groups.length > 0 && (
        <ul className="card-list wg-list">
          {groups.map((g) => (
            <li key={g.id}>
              <button className="wg-row" onClick={() => onOpen(g.id)}>
                <span className="wg-icon"><IconUsers size={16} /></span>
                <span className="wg-name">{g.name}</span>
                <span className="wg-meta">
                  {g.members.length} member{g.members.length === 1 ? "" : "s"} ·{" "}
                  {g.folders.reduce((n, f) => n + f.items.length, 0)} items
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ─── group detail ───────────────────────────────────────────────────────── */

function GroupDetail({
  group,
  profile,
  decks,
  events,
  life,
  onBack,
  onChange,
  onLeave,
  onImportDeck,
}: {
  group: Workgroup;
  profile: Profile;
  decks: Deck[];
  events: ReviewEvent[];
  life: LifeState;
  onBack: () => void;
  onChange: (g: Workgroup) => void;
  onLeave: () => void;
  onImportDeck: (name: string, cards: ParsedCard[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [syncState, setSyncState] = useState<SyncState>("off");

  /* ── live sync ─────────────────────────────────────────────────────────
     Channel per syncId; refs keep the latest group/onChange visible to the
     long-lived callbacks without resubscribing on every render. */
  const groupRef = useRef(group);
  groupRef.current = group;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastPushed = useRef<string>("");
  const pingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!group.syncId) return;
    const handle = joinSyncChannel(group.syncId, (remote) => {
      const local = groupRef.current;
      const merged = absorbRemote(local, remote);
      if (!merged) return;
      // Nothing local to contribute? Adopt silently, no push-back.
      if (JSON.stringify(merged) === JSON.stringify({ ...remote, syncId: local.syncId ?? remote.syncId })) {
        lastPushed.current = JSON.stringify(merged);
      }
      onChangeRef.current(merged);
    }, setSyncState);
    pingRef.current = handle.ping;
    return () => { pingRef.current = null; handle.leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.syncId]);

  /* Debounced push whenever the local copy actually changed. */
  useEffect(() => {
    if (!group.syncId) return;
    const json = JSON.stringify(group);
    if (json === lastPushed.current) return;
    const t = setTimeout(() => {
      pushSnapshot(group)
        .then(() => { lastPushed.current = json; pingRef.current?.(); })
        .catch(() => { /* transient — retried on the next change or refetch */ });
    }, 700);
    return () => clearTimeout(t);
  }, [group]);

  /* ── monthly stats: keep my own entry fresh (drives the leaderboard) ── */
  useEffect(() => {
    const month = monthKeyOf(Date.now());
    const mine = computeMonthly(events, life, month);
    const cur = (group.stats ?? []).find((s) => s.memberId === profile.id && s.month === month);
    if (cur && cur.points === mine.points && cur.activeDays === mine.activeDays) return;
    const entry = {
      memberId: profile.id, name: profile.name, month,
      points: mine.points, activeDays: mine.activeDays, updatedAt: Date.now(),
    };
    onChange({
      ...group,
      stats: [...(group.stats ?? []).filter((s) => !(s.memberId === profile.id && s.month === month)), entry],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, life, group, profile.id, profile.name]);

  const enableSync = () => {
    onChange({ ...group, syncId: makeSyncId() });
  };

  /* Keep my member entry's name/avatar aligned with my profile — that's how
     a new profile picture reaches the other members (via merge + sync). */
  useEffect(() => {
    const me = group.members.find((m) => m.id === profile.id);
    if (!me) return;
    if (me.name === profile.name && (me.avatar ?? undefined) === (profile.avatar ?? undefined)) return;
    onChange({
      ...group,
      members: group.members.map((m) =>
        m.id === profile.id
          ? { ...m, name: profile.name, ...(profile.avatar ? { avatar: profile.avatar } : { avatar: undefined }) }
          : m
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, profile]);

  const copyInvite = async () => {
    const link = encodeInvite(group);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the invite link:", link);
    }
  };

  const exportBundle = () => {
    const blob = new Blob([JSON.stringify({ v: 1, group }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${group.name.replace(/[^\w\- ]+/g, "").trim() || "group"}.memora.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBundle = async (f: File) => {
    const snap = decodeInvite(await f.text());
    if (snap && snap.id === group.id) {
      onChange(joinGroup([group], snap, profile)[0]);
    } else if (snap) {
      window.alert("This bundle belongs to a different group. Join it from the groups page.");
    } else {
      window.alert("Not a valid Memora bundle.");
    }
  };

  const addFolder = () => {
    if (!folderName.trim()) return;
    onChange({
      ...group,
      folders: [...group.folders, { id: uid(), name: folderName.trim(), items: [] }],
    });
    setFolderName("");
  };

  return (
    <>
      <div className="row spread">
        <button className="ghost small" onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
          <IconArrowLeft size={13} /> Groups
        </button>
        <button
          className="ghost small danger"
          onClick={() => window.confirm(`Leave "${group.name}"? This removes your local copy.`) && onLeave()}
        >
          Leave group
        </button>
      </div>

      <h2>{group.name}</h2>
      {group.description && <p className="hint">{group.description}</p>}

      <section className="card-box">
        <div className="row spread">
          <div className="wg-members">
            {group.members.map((m) => (
              <span key={m.id} className={m.id === profile.id ? "member-chip me" : "member-chip"}>
                {m.avatar
                  ? <img className="avatar-mini" src={m.avatar} alt="" />
                  : <span className="avatar-mini avatar-letter" aria-hidden="true">{(m.name[0] ?? "?").toUpperCase()}</span>}
                {m.name}{m.role === "owner" ? " ★" : ""}
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: ".4rem" }}>
            <button className="primary small" onClick={copyInvite}
              style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
              {copied ? <><IconCheck size={13} /> Copied!</> : "Copy invite link"}
            </button>
            <button className="ghost small" title="Export the group as a file"
              onClick={exportBundle}
              style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
              <IconDownload size={13} /> Export
            </button>
            <button className="ghost small" title="Import a bundle from a member"
              onClick={() => fileRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
              <IconUpload size={13} /> Import
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importBundle(f);
              }} />
          </div>
        </div>
        <div className="row" style={{ marginTop: ".6rem", alignItems: "center", gap: ".6rem" }}>
          {group.syncId ? (
            <span className={`sync-badge sync-${syncState}`}>
              <span className="sync-dot" aria-hidden="true" />
              {syncState === "live" ? "Live sync on — changes flow by themselves"
                : syncState === "connecting" ? "Connecting…"
                : syncState === "error" ? "Sync offline — retrying; links still work"
                : "Sync off"}
            </span>
          ) : (
            <>
              <button className="ghost small" onClick={enableSync}>⚡ Turn on live sync</button>
              <span className="hint" style={{ fontSize: ".78rem" }}>
                chat, events and the leaderboard update on every member's app automatically
              </span>
            </>
          )}
        </div>
        <p className="wg-sync-hint">
          Share the invite link to let people join.{" "}
          {group.syncId
            ? "New members get live sync automatically — it ships inside the link."
            : "Without live sync, content merges when members exchange links or bundle files."}
        </p>
      </section>

      <LeaderboardBox group={group} profile={profile} />

      <ChatBox group={group} profile={profile} onChange={onChange} />

      <EventsBox group={group} profile={profile} onChange={onChange} />

      <section className="card-box">
        <div className="row">
          <input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="New shared folder (e.g. Dispense, Esercizi)…"
            onKeyDown={(e) => e.key === "Enter" && addFolder()}
          />
          <button className="primary" disabled={!folderName.trim()} onClick={addFolder}>
            Add folder
          </button>
        </div>
      </section>

      {group.folders.map((folder) => (
        <FolderBox
          key={folder.id}
          folder={folder}
          decks={decks}
          profile={profile}
          onChange={(f) =>
            onChange({ ...group, folders: group.folders.map((x) => (x.id === f.id ? f : x)) })
          }
          onDelete={() =>
            window.confirm(`Delete folder "${folder.name}" from your copy?`) &&
            onChange({ ...group, folders: group.folders.filter((x) => x.id !== folder.id) })
          }
          onImportDeck={onImportDeck}
        />
      ))}
    </>
  );
}

/* ─── monthly leaderboard: sealed until the month closes ─────────────────── */

/**
 * The sana competizione: every member's study effort — any subject — earns
 * points and active days. During the month you only see YOUR numbers (a live
 * ranking would let the leader coast); on the 1st the previous month's podium
 * is revealed, twice: who studied most, and who was most constant.
 */
function LeaderboardBox({ group, profile }: { group: Workgroup; profile: Profile }) {
  const stats = group.stats ?? [];
  const nowMonth = monthKeyOf(Date.now());
  const lastMonth = prevMonthKey(nowMonth);

  const podium = rankByPoints(stats, lastMonth);
  const constancy = rankByConstancy(stats, lastMonth);
  const mine = stats.find((s) => s.memberId === profile.id && s.month === nowMonth);
  const participants = stats.filter((s) => s.month === nowMonth).length;

  const monthLabel = (key: string) =>
    new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <section className="card-box">
      <h3>🏆 Monthly leaderboard</h3>

      {podium.length > 0 && (
        <div className="lb-podium">
          <p className="lb-month">{monthLabel(lastMonth)}</p>
          <ol className="lb-list">
            {podium.map((s, i) => {
              const av = group.members.find((m) => m.id === s.memberId)?.avatar;
              return (
                <li key={s.memberId} className={s.memberId === profile.id ? "lb-row me" : "lb-row"}>
                  <span className="lb-medal">{MEDALS[i] ?? `${i + 1}.`}</span>
                  {av && <img className="avatar-mini lb-avatar" src={av} alt="" />}
                  <span className="lb-name">{s.name}</span>
                  <span className="lb-pts">{s.points.toLocaleString()} pt · {s.activeDays} days</span>
                </li>
              );
            })}
          </ol>
          {constancy[0] && (
            <p className="lb-constancy">
              🔁 Most constant: <strong>{constancy[0].name}</strong> — {constancy[0].activeDays} study days
            </p>
          )}
        </div>
      )}

      <div className="lb-current">
        <p className="lb-month">{monthLabel(nowMonth)} — in progress</p>
        <p className="lb-mine">
          You so far: <strong>{(mine?.points ?? 0).toLocaleString()} pt</strong> · {mine?.activeDays ?? 0} study days
          {participants > 1 && <span className="hint"> · {participants} members in the running</span>}
        </p>
        <p className="hint">
          The ranking stays sealed until the 1st — no coasting for whoever's
          ahead. Points count studying (reviews, focus, habits), not the
          subject: different degrees, same race.
        </p>
      </div>
    </section>
  );
}

/* ─── group chat: shared message board with GIFs & stickers ──────────────── */

/**
 * Chat messages live in the group snapshot like folders and events: they
 * merge by id and travel with invite links and bundles. It's a message
 * board, not a realtime line — members see new messages when snapshots are
 * exchanged. GIF/sticker search is KLIPY-powered (see gifs.ts); without a
 * key the picker still accepts a pasted image URL.
 */
function ChatBox({
  group,
  profile,
  onChange,
}: {
  group: Workgroup;
  profile: Profile;
  onChange: (g: Workgroup) => void;
}) {
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<null | "gif" | "sticker">(null);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = [...(group.chat ?? [])].sort((a, b) => a.at - b.at);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const push = (msg: Omit<ChatMessage, "id" | "author" | "at">) =>
    onChange({
      ...group,
      chat: [...(group.chat ?? []), { ...msg, id: uid(), author: profile.name, at: Date.now() }],
    });

  const sendText = () => {
    if (!text.trim()) return;
    push({ kind: "text", text: text.trim() });
    setText("");
  };

  const sendMedia = (kind: "gif" | "sticker", url: string, alt: string) => {
    push({ kind, text: alt, media: url });
    setPicker(null);
  };

  const fmtAt = (at: number) => {
    const d = new Date(at);
    const sameDay = new Date().toDateString() === d.toDateString();
    return sameDay
      ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };

  return (
    <section className="card-box">
      <h3>💬 Group chat</h3>

      {messages.length === 0 ? (
        <p className="hint">No messages yet — say hi, or open with a meme.</p>
      ) : (
        <div className="wg-chat" ref={listRef}>
          {messages.map((m) => (
            <div key={m.id} className={m.author === profile.name ? "wg-msg mine" : "wg-msg"}>
              <span className="wg-msg-meta">
                {(() => {
                  const av = group.members.find((x) => x.name === m.author)?.avatar;
                  return av ? <img className="avatar-mini" src={av} alt="" /> : null;
                })()}
                {m.author} · {fmtAt(m.at)}
              </span>
              {m.media ? (
                <img
                  className={m.kind === "sticker" ? "wg-msg-media sticker" : "wg-msg-media"}
                  src={m.media}
                  alt={m.text || m.kind}
                  loading="lazy"
                />
              ) : (
                <span className="wg-msg-bubble">{m.text}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="row wg-add">
        <button
          className={picker === "gif" ? "ghost small on" : "ghost small"}
          title="Send a GIF"
          onClick={() => setPicker(picker === "gif" ? null : "gif")}
        >
          GIF
        </button>
        <button
          className={picker === "sticker" ? "ghost small on" : "ghost small"}
          title="Send a sticker"
          onClick={() => setPicker(picker === "sticker" ? null : "sticker")}
        >
          Sticker
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the group…"
          onKeyDown={(e) => e.key === "Enter" && sendText()}
          style={{ flex: 1 }}
        />
        <button className="primary small" disabled={!text.trim()} onClick={sendText}>
          Send
        </button>
      </div>

      {picker && <GifPicker kind={picker} onPick={(g) => sendMedia(picker, g.url, g.alt)} />}

      <p className="wg-sync-hint">
        Messages sync like everything else: exchange a fresh invite link or a
        bundle and the conversation merges on every member's copy.
      </p>
    </section>
  );
}

/** Tenor search grid; falls back to a paste-a-URL row when no key is baked in. */
function GifPicker({ kind, onPick }: { kind: "gif" | "sticker"; onPick: (g: GifResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");

  useEffect(() => {
    if (!gifSearchAvailable()) return;
    let stale = false;
    const t = setTimeout(() => {
      searchGifs(q, kind)
        .then((r) => { if (!stale) { setResults(r); setError(null); } })
        .catch(() => { if (!stale) setError("Search failed — check the connection and try again."); });
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [q, kind]);

  const pasteOk = /^https:\/\/\S+/i.test(pasteUrl.trim());

  return (
    <div className="wg-gif-picker">
      {gifSearchAvailable() ? (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === "sticker" ? "Search meme stickers…" : "Search GIFs…"}
            autoFocus
          />
          {error && <p className="error-text">{error}</p>}
          <div className="wg-gif-grid">
            {results.map((g) => (
              <button key={g.id} className="wg-gif-cell" title={g.alt} onClick={() => onPick(g)}>
                <img src={g.preview} alt={g.alt} loading="lazy" />
              </button>
            ))}
          </div>
          {results.length === 0 && !error && <p className="hint">Searching…</p>}
          {/* Required attribution per KLIPY's integration terms. */}
          <p className="hint wg-gif-attribution">powered by KLIPY</p>
        </>
      ) : (
        <>
          <p className="hint">
            GIF search isn't configured in this build (the app owner adds a free
            KLIPY key — see the README). You can still paste a direct image link:
          </p>
          <div className="row">
            <input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://…gif"
              style={{ flex: 1 }}
            />
            <button
              className="primary small"
              disabled={!pasteOk}
              onClick={() => onPick({ id: "pasted", url: pasteUrl.trim(), preview: pasteUrl.trim(), alt: kind })}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── group events: mini calendar + shared appointments ──────────────────── */

function localDayStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Group events live inside the group snapshot, so they travel with invite
 * links and bundles like folders do — plan once, everyone who syncs sees it.
 * "Google Calendar" opens a pre-filled add-event page in the browser: it uses
 * the member's own Google login, no OAuth app required. The .ics download
 * covers Apple Calendar and Outlook.
 */
function EventsBox({
  group,
  profile,
  onChange,
}: {
  group: Workgroup;
  profile: Profile;
  onChange: (g: Workgroup) => void;
}) {
  const today = localDayStr(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");

  const events = group.events ?? [];
  const eventDates = new Set(events.map((e) => e.date));

  // Monday-first grid: offset of the 1st, then one cell per day.
  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => localDayStr(new Date(cursor.y, cursor.m, i + 1))),
  ];

  const move = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const addEvent = () => {
    if (!title.trim()) return;
    const ev: GroupEvent = {
      id: uid(), title: title.trim(), date: selected,
      ...(time ? { time } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      createdBy: profile.name, createdAt: Date.now(),
    };
    onChange({ ...group, events: [...events, ev] });
    setTitle(""); setTime(""); setLocation("");
  };

  const downloadICS = (ev: GroupEvent) => {
    const blob = new Blob([eventToICS(ev, group.name)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ev.title.replace(/[^\w\- ]+/g, "").trim() || "evento"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
  );
  const dayEvents = sorted.filter((e) => e.date === selected);
  const upcoming = sorted.filter((e) => e.date >= today && e.date !== selected).slice(0, 5);

  const fmtDay = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  const eventRow = (ev: GroupEvent, showDate: boolean) => (
    <li key={ev.id} className="wg-event">
      <span className="wg-event-when">
        {showDate && `${fmtDay(ev.date)} · `}{ev.time ?? "all day"}
      </span>
      <span className="wg-event-title">
        <strong>{ev.title}</strong>
        {ev.location && <span className="wg-event-loc"> · {ev.location}</span>}
        <span className="wg-item-meta"> · {ev.createdBy}</span>
      </span>
      <span className="wg-event-actions">
        <button
          className="ghost small"
          title="Add to Google Calendar (uses your Google account in the browser)"
          onClick={() => window.open(googleCalendarUrl(ev, group.name), "_blank")}
        >
          Google Calendar
        </button>
        <button className="ghost small" title="Download .ics (Apple Calendar, Outlook)" onClick={() => downloadICS(ev)}>
          .ics
        </button>
        <button
          className="icon small wg-item-del"
          title="Remove event"
          onClick={() => onChange({ ...group, events: events.filter((x) => x.id !== ev.id) })}
        >
          <IconTrash size={12} />
        </button>
      </span>
    </li>
  );

  return (
    <section className="card-box">
      <h3>📅 Group events</h3>
      <div className="wg-events-grid">
        <div className="wg-cal-wrap">
          <div className="wg-cal-head">
            <button className="icon small" title="Previous month" onClick={() => move(-1)}>‹</button>
            <span className="wg-cal-title">{monthLabel}</span>
            <button className="icon small" title="Next month" onClick={() => move(1)}>›</button>
          </div>
          <div className="wg-cal">
            {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
              <span key={i} className="wg-cal-wd">{w}</span>
            ))}
            {cells.map((date, i) =>
              date === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  key={date}
                  className={[
                    "wg-cal-day",
                    date === selected ? "on" : "",
                    date === today ? "today" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setSelected(date)}
                >
                  {Number(date.slice(8))}
                  {eventDates.has(date) && <span className="ev-dot" aria-hidden="true" />}
                </button>
              )
            )}
          </div>
        </div>

        <div className="wg-events-side">
          <p className="wg-events-daylabel">{fmtDay(selected)}</p>
          {dayEvents.length === 0 && <p className="hint">Nothing planned this day.</p>}
          <ul className="wg-events-list">{dayEvents.map((ev) => eventRow(ev, false))}</ul>

          <div className="row wg-add">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title…"
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
              style={{ flex: "1 1 150px" }}
            />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} title="Time (optional)" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Place (optional)"
              style={{ flex: "0 1 140px" }}
            />
            <button className="primary small" disabled={!title.trim()} onClick={addEvent}>
              Add
            </button>
          </div>

          {upcoming.length > 0 && (
            <>
              <p className="wg-events-daylabel" style={{ marginTop: ".8rem" }}>Upcoming</p>
              <ul className="wg-events-list">{upcoming.map((ev) => eventRow(ev, true))}</ul>
            </>
          )}
        </div>
      </div>
      <p className="wg-sync-hint">
        Events travel with the group: share a fresh invite link (or export a
        bundle) after planning and everyone sees them. "Google Calendar" adds
        the event through your own Google account in the browser.
      </p>
    </section>
  );
}

/* ─── shared folder ──────────────────────────────────────────────────────── */

function FolderBox({
  folder,
  decks,
  profile,
  onChange,
  onDelete,
  onImportDeck,
}: {
  folder: SharedFolder;
  decks: Deck[];
  profile: Profile;
  onChange: (f: SharedFolder) => void;
  onDelete: () => void;
  onImportDeck: (name: string, cards: ParsedCard[]) => void;
}) {
  const [kind, setKind] = useState<SharedItem["kind"]>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [importedId, setImportedId] = useState<string | null>(null);

  const addItem = () => {
    let itemTitle = title.trim();
    let itemContent = content.trim();
    if (kind === "deck") {
      const d = decks.find((x) => x.id === deckId);
      if (!d) return;
      itemTitle = itemTitle || d.name;
      itemContent = JSON.stringify(d.cards.map((c) => ({ front: c.front, back: c.back })));
    }
    if (!itemTitle || !itemContent) return;
    onChange({
      ...folder,
      items: [...folder.items, {
        id: uid(), kind, title: itemTitle, content: itemContent,
        addedBy: profile.name, addedAt: Date.now(),
      }],
    });
    setTitle("");
    setContent("");
  };

  const importDeckItem = (item: SharedItem) => {
    try {
      const cards = JSON.parse(item.content) as ParsedCard[];
      if (!Array.isArray(cards)) return;
      onImportDeck(item.title, cards.filter((c) => c && c.front && c.back));
      setImportedId(item.id);
      setTimeout(() => setImportedId(null), 2000);
    } catch { /* corrupted payload — ignore */ }
  };

  const canAdd =
    kind === "deck" ? Boolean(deckId) : Boolean(title.trim() && content.trim());

  return (
    <section className="card-box wg-folder">
      <div className="row spread">
        <h3>📁 {folder.name}</h3>
        <button className="icon small" title="Delete folder" onClick={onDelete}>
          <IconTrash size={13} />
        </button>
      </div>

      {folder.items.length > 0 && (
        <ul className="wg-items">
          {folder.items.map((item) => (
            <li key={item.id} className="wg-item">
              <div className="wg-item-main">
                <span className={`kind-chip kind-${item.kind}`}>
                  {item.kind === "deck" ? "DECK" : item.kind === "link" ? "LINK" : "NOTE"}
                </span>
                <strong>{item.title}</strong>
                <span className="wg-item-meta">
                  {item.addedBy} · {new Date(item.addedAt).toLocaleDateString()}
                </span>
              </div>
              {item.kind === "note" && <p className="wg-item-body">{item.content}</p>}
              {item.kind === "link" && (
                <a className="wg-item-body" href={item.content} target="_blank" rel="noreferrer">
                  {item.content}
                </a>
              )}
              {item.kind === "deck" && (
                <button
                  className="ghost small"
                  onClick={() => importDeckItem(item)}
                  style={{ display: "flex", alignItems: "center", gap: ".35rem" }}
                >
                  {importedId === item.id
                    ? <><IconCheck size={13} /> Added to your decks</>
                    : <><IconDownload size={13} /> Import into my decks</>}
                </button>
              )}
              <button
                className="icon small wg-item-del"
                title="Remove from your copy"
                onClick={() =>
                  onChange({ ...folder, items: folder.items.filter((x) => x.id !== item.id) })
                }
              >
                <IconTrash size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row wg-add">
        <select value={kind} onChange={(e) => setKind(e.target.value as SharedItem["kind"])}>
          <option value="note">Note</option>
          <option value="link">Link</option>
          <option value="deck">Deck</option>
        </select>
        {kind === "deck" ? (
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            {decks.length === 0 && <option value="">No decks yet</option>}
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.cards.length} cards)</option>
            ))}
          </select>
        ) : (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title…"
              style={{ flex: "0 1 180px" }}
            />
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={kind === "link" ? "https://…" : "Note text…"}
            />
          </>
        )}
        <button className="primary small" disabled={!canAdd} onClick={addItem}>
          Share
        </button>
      </div>
    </section>
  );
}
