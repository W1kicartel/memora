/**
 * track.ts — action log for the operator dashboard.
 *
 * Companion to usage.ts. That one answers "how long was the app open";
 * this one answers "what was done in it", and feeds the dashboard's
 * "Azioni" view.
 *
 * Same privacy posture as the heartbeat: kinds and light metadata only.
 * `detail` carries counts and fixed labels ("due", "all", "ai"), never a
 * deck name, a card's text, a chat message or anything a user typed. If
 * you add a call site, keep it that way — the server truncates `detail`
 * at 120 chars but it cannot tell content from a label.
 *
 * Best-effort: a failed send is dropped, never retried, never surfaced.
 * Nothing in the UI waits on it.
 */

import { syncRpc } from "./sync";
import { loadProfile } from "./workgroup";
import { IS_SOCIAL } from "./edition";
import { installId } from "./usage";
import pkg from "../package.json";

/** The actions worth seeing in the dashboard. Add here, not as loose strings,
 *  so the filter in the admin panel stays a closed list. */
export type EventKind =
  | "app_open"
  | "nav"
  | "nav_sub"
  | "deck_created"
  | "deck_deleted"
  | "card_added"
  | "card_edited"
  | "card_deleted"
  | "cards_imported"
  | "study_started"
  | "study_finished"
  | "ai_used"
  | "pomodoro_done"
  | "habit_done"
  | "group_joined"
  | "group_message"
  | "export_pdf"
  | "demo_loaded";

/* The kinds that come from effects rather than from a click. React runs
   effects twice under StrictMode, and a remount would repeat them too, so
   an identical one arriving within a moment is a duplicate, not a second
   action. Click-driven kinds are left alone: there, two in a row is two
   real actions and dropping one would be a lie. */
const DEDUPED: ReadonlySet<string> = new Set(["app_open", "nav", "nav_sub"]);
const DEDUPE_MS = 1500;
const lastSent = new Map<string, number>();

/**
 * Record one action. Fire-and-forget: callers must not await it.
 *
 * @param detail short label or count — never user-authored text.
 */
export function track(kind: EventKind, detail: string | number = ""): void {
  if (DEDUPED.has(kind)) {
    const sig = `${kind}|${detail}`;
    const now = Date.now();
    const prev = lastSent.get(sig);
    if (prev !== undefined && now - prev < DEDUPE_MS) return;
    lastSent.set(sig, now);
  }
  void syncRpc<void>("track_event", {
    p_install: installId(),
    p_kind: kind,
    p_detail: String(detail),
    p_name: loadProfile()?.name ?? "",
    p_member: loadProfile()?.id ?? "",
    p_edition: IS_SOCIAL ? "social" : "private",
    p_version: (pkg as { version?: string }).version ?? "",
  }).catch(() => {
    /* offline / relay down — an action log is not worth a retry queue */
  });
}
