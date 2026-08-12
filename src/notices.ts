/**
 * notices.ts — announcements from the app operator.
 *
 * The admin dashboard (admin/dashboard.html) writes notices on the backend,
 * targeted at everyone, at a group, or at specific members. Each app pulls
 * the ones addressed to it (self-declared identity — notices are
 * announcements, not secrets) and shows the unseen ones once.
 */

import { syncRpc } from "./sync";
import { loadProfile, loadGroups } from "./workgroup";
import { installId } from "./usage";

export interface Notice {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

const SEEN_KEY = "memora:notices:seen:v1";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markNoticeSeen(id: string): void {
  try {
    const seen = loadSeen();
    seen.add(id);
    // Keep the seen-set bounded; the server only returns 90 days anyway.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
  } catch { /* storage unavailable */ }
}

/** Notices addressed to this device that haven't been shown yet (oldest first). */
export async function fetchUnseenNotices(): Promise<Notice[]> {
  const profile = loadProfile();
  const syncIds = loadGroups()
    .map((g) => g.syncId)
    .filter((s): s is string => Boolean(s));
  const all = await syncRpc<Notice[] | null>("get_notices", {
    p_member_id: profile?.id ?? "",
    p_sync_ids: syncIds,
    p_install_id: installId(),
  });
  const seen = loadSeen();
  return (all ?? []).filter((n) => !seen.has(n.id)).reverse();
}
