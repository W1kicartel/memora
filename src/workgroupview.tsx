import { useRef, useState } from "react";
import type { Deck } from "./types";
import type { ParsedCard } from "./import";
import { uid } from "./storage";
import { IconUsers, IconArrowLeft, IconTrash, IconDownload, IconUpload, IconCheck } from "./icons";
import {
  type Workgroup, type SharedFolder, type SharedItem, type Profile,
  loadGroups, saveGroups, loadProfile, saveProfile,
  createGroup, encodeInvite, decodeInvite, joinGroup,
} from "./workgroup";

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
  onImportDeck,
}: {
  decks: Deck[];
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
  onBack,
  onChange,
  onLeave,
  onImportDeck,
}: {
  group: Workgroup;
  profile: Profile;
  decks: Deck[];
  onBack: () => void;
  onChange: (g: Workgroup) => void;
  onLeave: () => void;
  onImportDeck: (name: string, cards: ParsedCard[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
        <p className="wg-sync-hint">
          Share the invite link to let people join. Content syncs when members
          exchange links or bundle files — every import merges, nothing is lost.
        </p>
      </section>

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
