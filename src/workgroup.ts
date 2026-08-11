/**
 * workgroup.ts — study groups with shared material folders.
 *
 * Local-first by design, like the rest of Memora: a group lives on each
 * member's machine, and travels between members through
 *
 *   • INVITE LINKS — a `memora://join/…` code that encodes the whole group
 *     snapshot (base64url JSON). Paste one into "Join a group" and you're in,
 *     Discord-style: one link, no account.
 *   • SYNC BUNDLES — the same snapshot as a downloadable .json file, for
 *     content too large to travel comfortably inside a link.
 *
 * Receiving a snapshot always goes through mergeGroups(), which unions
 * members, folders and items by id — so exchanging links/bundles in any order
 * converges. A realtime backend can later implement the same merge over the
 * wire without touching the UI.
 *
 * Pure logic + localStorage persistence. No React. Tested in workgroup.test.ts.
 */

import { uid } from "./storage";

/* ─── types ───────────────────────────────────────────────────────────────── */

export interface Member {
  id: string;
  name: string;
  role: "owner" | "member";
  joinedAt: number;
}

/** One piece of shared study material. */
export interface SharedItem {
  id: string;
  kind: "note" | "link" | "deck";
  title: string;
  /** note body, URL, or JSON-serialized {front,back}[] for kind="deck". */
  content: string;
  addedBy: string;   // member name (denormalized — survives roster changes)
  addedAt: number;
}

export interface SharedFolder {
  id: string;
  name: string;
  items: SharedItem[];
}

/**
 * One member's study numbers for one month — the leaderboard's raw material.
 * Cross-subject by design: points and active days measure the studying, not
 * the syllabus, so friends on different degrees compete on equal footing.
 */
export interface MemberMonthly {
  memberId: string;
  name: string;
  month: string;      // YYYY-MM
  points: number;     // study points earned that month
  activeDays: number; // distinct days with real study activity
  updatedAt: number;  // last-write-wins merge key
}

/** One chat message on the group's shared board. */
export interface ChatMessage {
  id: string;
  kind: "text" | "gif" | "sticker";
  /** message body; for gif/sticker it's the search label (used as alt text). */
  text: string;
  /** https URL of the GIF/sticker image (Tenor CDN or pasted by the user). */
  media?: string;
  author: string;   // member name, denormalized like SharedItem.addedBy
  at: number;
}

/** A group appointment: study session, exam date, aperitivo — anything. */
export interface GroupEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM (omitted → all-day)
  location?: string;
  notes?: string;
  createdBy: string;  // member name (denormalized, like SharedItem.addedBy)
  createdAt: number;
}

export interface Workgroup {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  members: Member[];
  folders: SharedFolder[];
  /** Optional so snapshots from pre-events versions keep decoding. */
  events?: GroupEvent[];
  /** Optional for the same reason — chat arrived after events. */
  chat?: ChatMessage[];
  /** Monthly study stats per member (leaderboard). */
  stats?: MemberMonthly[];
  /**
   * Live-sync capability: an unguessable id keying the group's row on the
   * relay backend. It travels inside invite links, so joining a group also
   * grants live sync — same trust model as everything else.
   */
  syncId?: string;
}

/** The local user's identity, shared with groups they join. */
export interface Profile {
  id: string;
  name: string;
}

/* ─── persistence ─────────────────────────────────────────────────────────── */

const GROUPS_KEY = "memora:groups:v1";
const PROFILE_KEY = "memora:profile:v1";

export function loadGroups(): Workgroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    const g = raw ? (JSON.parse(raw) as Workgroup[]) : [];
    return Array.isArray(g) ? g : [];
  } catch {
    return [];
  }
}

export function saveGroups(groups: Workgroup[]): void {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch { /* storage unavailable — fail silently */ }
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    return p && p.id && p.name ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(name: string): Profile {
  const existing = loadProfile();
  const p: Profile = { id: existing?.id ?? uid(), name: name.trim() };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch { /* ignore */ }
  return p;
}

/* ─── group construction ──────────────────────────────────────────────────── */

export function createGroup(name: string, description: string, owner: Profile): Workgroup {
  return {
    id: uid(),
    name: name.trim(),
    description: description.trim(),
    createdAt: Date.now(),
    members: [{ id: owner.id, name: owner.name, role: "owner", joinedAt: Date.now() }],
    folders: [],
    events: [],
    chat: [],
    stats: [],
  };
}

/* ─── invite links (self-contained snapshots) ─────────────────────────────── */

const INVITE_PREFIX = "memora://join/";

/** Unicode-safe base64url. */
function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Serialize a group into a shareable invite link. */
export function encodeInvite(group: Workgroup): string {
  return INVITE_PREFIX + b64encode(JSON.stringify({ v: 1, group }));
}

/**
 * Parse an invite link (or a bare code, or a raw bundle JSON) back into a
 * group snapshot. Returns null on anything malformed — never throws.
 */
export function decodeInvite(text: string): Workgroup | null {
  const t = text.trim();
  try {
    // Raw bundle JSON (from an exported .json file) is accepted too.
    if (t.startsWith("{")) {
      const obj = JSON.parse(t) as { v?: number; group?: Workgroup };
      return validGroup(obj.group) ? obj.group! : null;
    }
    const code = t.startsWith(INVITE_PREFIX) ? t.slice(INVITE_PREFIX.length) : t;
    const obj = JSON.parse(b64decode(code)) as { v?: number; group?: Workgroup };
    return validGroup(obj.group) ? obj.group! : null;
  } catch {
    return null;
  }
}

function validGroup(g: Workgroup | undefined): boolean {
  return Boolean(
    g && typeof g.id === "string" && g.id &&
    typeof g.name === "string" && g.name &&
    Array.isArray(g.members) && Array.isArray(g.folders),
  );
}

/* ─── merge (the sync primitive) ──────────────────────────────────────────── */

/**
 * Union-merge an incoming snapshot into the local copy of the same group.
 * Members, folders and items are deduplicated by id; local metadata wins.
 * Commutative over repeated exchanges, so any link/bundle order converges.
 */
export function mergeGroups(local: Workgroup, incoming: Workgroup): Workgroup {
  const members = [...local.members];
  for (const m of incoming.members) {
    if (!members.some((x) => x.id === m.id)) members.push(m);
  }

  const folders = local.folders.map((f) => ({ ...f, items: [...f.items] }));
  for (const inF of incoming.folders) {
    const target = folders.find((f) => f.id === inF.id);
    if (!target) {
      folders.push({ ...inF, items: [...inF.items] });
    } else {
      for (const it of inF.items) {
        if (!target.items.some((x) => x.id === it.id)) target.items.push(it);
      }
    }
  }

  // Events and chat union by id — tolerant of snapshots that predate them.
  const events = [...(local.events ?? [])];
  for (const e of incoming.events ?? []) {
    if (!events.some((x) => x.id === e.id)) events.push(e);
  }
  const chat = [...(local.chat ?? [])];
  for (const m of incoming.chat ?? []) {
    if (!chat.some((x) => x.id === m.id)) chat.push(m);
  }
  chat.sort((a, b) => a.at - b.at);

  // Stats are mutable counters, so they merge last-write-wins per
  // (member, month) instead of union-by-id.
  const stats = [...(local.stats ?? [])];
  for (const s of incoming.stats ?? []) {
    const i = stats.findIndex((x) => x.memberId === s.memberId && x.month === s.month);
    if (i < 0) stats.push(s);
    else if (s.updatedAt > stats[i].updatedAt) stats[i] = s;
  }

  return { ...local, members, folders, events, chat, stats, syncId: local.syncId ?? incoming.syncId };
}

/* ─── calendar bridges (Google Calendar link + universal .ics) ────────────── */

/** "2026-08-15" + "19:30" → "20260815T193000"; date only → "20260815". */
function compactStamp(date: string, time?: string): string {
  const d = date.replace(/-/g, "");
  if (!time) return d;
  return `${d}T${time.replace(":", "")}00`;
}

/** Day after a YYYY-MM-DD date, for all-day event end bounds (noon anchor avoids TZ edges). */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** One hour after HH:MM, clamped to 23:59 so the stamp stays same-day valid. */
function plusOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Pre-filled Google Calendar "add event" link. Opened in the browser, it uses
 * the user's own Google login — one click and the event lands in their
 * calendar, no API key or OAuth app needed. Timed events use floating local
 * times (Google renders them in the user's calendar timezone).
 */
export function googleCalendarUrl(ev: GroupEvent, groupName: string): string {
  const dates = ev.time
    ? `${compactStamp(ev.date, ev.time)}/${compactStamp(ev.date, plusOneHour(ev.time))}`
    : `${compactStamp(ev.date)}/${compactStamp(nextDay(ev.date))}`;
  const details = [ev.notes, `Evento del gruppo «${groupName}» su Memora`]
    .filter(Boolean).join("\n\n");
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates, details });
  if (ev.location) p.set("location", ev.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Escape per RFC 5545: backslash, newline, comma and semicolon. */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
}

/**
 * A minimal RFC 5545 calendar file for one event — the universal fallback:
 * Apple Calendar, Outlook and Google all import it.
 */
export function eventToICS(ev: GroupEvent, groupName: string): string {
  const dt = ev.time
    ? [`DTSTART:${compactStamp(ev.date, ev.time)}`, `DTEND:${compactStamp(ev.date, plusOneHour(ev.time))}`]
    : [`DTSTART;VALUE=DATE:${compactStamp(ev.date)}`, `DTEND;VALUE=DATE:${compactStamp(nextDay(ev.date))}`];
  const details = [ev.notes, `Evento del gruppo «${groupName}» su Memora`]
    .filter(Boolean).join("\n\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Memora//Group Events//IT",
    "BEGIN:VEVENT",
    `UID:${ev.id}@memora`,
    ...dt,
    `SUMMARY:${icsEscape(ev.title)}`,
    ...(ev.location ? [`LOCATION:${icsEscape(ev.location)}`] : []),
    `DESCRIPTION:${icsEscape(details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Join from an invite: merge into an existing copy or adopt the snapshot, adding self. */
export function joinGroup(existing: Workgroup[], snapshot: Workgroup, self: Profile): Workgroup[] {
  const mine = existing.find((g) => g.id === snapshot.id);
  const merged = mine ? mergeGroups(mine, snapshot) : { ...snapshot };
  if (!merged.members.some((m) => m.id === self.id)) {
    merged.members = [
      ...merged.members,
      { id: self.id, name: self.name, role: "member", joinedAt: Date.now() },
    ];
  }
  return mine
    ? existing.map((g) => (g.id === merged.id ? merged : g))
    : [...existing, merged];
}
