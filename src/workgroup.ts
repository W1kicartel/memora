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

export interface Workgroup {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  members: Member[];
  folders: SharedFolder[];
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

  return { ...local, members, folders };
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
