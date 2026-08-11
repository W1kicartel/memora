/**
 * sync.ts — live group sync over Supabase.
 *
 * The local-first model stays exactly as it is: groups live on each device
 * and converge through mergeGroups(). This module just adds a relay so the
 * exchange happens by itself instead of via pasted links:
 *
 *   • one row per group on the backend, keyed by an unguessable syncId that
 *     travels inside invite links (holding the link = holding the key — the
 *     same trust model as everything else in Memora);
 *   • a Realtime broadcast channel per group: after pushing, a client pings
 *     the channel; everyone else re-fetches and union-merges.
 *
 * The table itself is locked (RLS, no policies): the only doors are two
 * capability-checked RPCs, so nobody can list other people's groups.
 * The publishable key below is designed to be shipped in clients.
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { mergeGroups, type Workgroup } from "./workgroup";

const SYNC_URL = "https://dbuykuhtajbaxgbeuuch.supabase.co";
const SYNC_KEY = "sb_publishable_kxK1Q9pAeCzFRPiP3EMuEQ_sL4Yq-qE";

let client: SupabaseClient | null = null;
function supa(): SupabaseClient {
  return (client ??= createClient(SYNC_URL, SYNC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** 32 chars of crypto randomness — the group's sync capability. */
export function makeSyncId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/** Generic RPC helper for other modules (notices, future endpoints). */
export async function syncRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supa().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchSnapshot(syncId: string): Promise<Workgroup | null> {
  const { data, error } = await supa().rpc("get_snapshot", { p_sync_id: syncId });
  if (error) throw new Error(error.message);
  return (data as Workgroup | null) ?? null;
}

export async function pushSnapshot(group: Workgroup): Promise<void> {
  if (!group.syncId) return;
  const { error } = await supa().rpc("push_snapshot", {
    p_sync_id: group.syncId,
    p_payload: group,
  });
  if (error) throw new Error(error.message);
}

export type SyncState = "off" | "connecting" | "live" | "error";

/**
 * Join a group's broadcast channel. `onRemote` receives the freshly fetched
 * remote snapshot every time another member pushes (and once on connect, to
 * catch up). Returns a handle to ping after local pushes and to leave.
 */
export function joinSyncChannel(
  syncId: string,
  onRemote: (remote: Workgroup) => void,
  onState: (s: SyncState) => void,
): { ping: () => void; leave: () => void } {
  const chan: RealtimeChannel = supa().channel(`grp:${syncId}`, {
    config: { broadcast: { self: false } },
  });

  const refetch = () => {
    fetchSnapshot(syncId)
      .then((remote) => { if (remote) onRemote(remote); })
      .catch(() => { /* transient — the next ping retries */ });
  };

  onState("connecting");
  chan
    .on("broadcast", { event: "updated" }, refetch)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") { onState("live"); refetch(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onState("error");
    });

  return {
    ping: () => { void chan.send({ type: "broadcast", event: "updated", payload: {} }); },
    leave: () => { void supa().removeChannel(chan); onState("off"); },
  };
}

/**
 * Merge a remote snapshot into the local group. Returns the merged group when
 * it differs from local (caller persists + pushes back so stragglers catch
 * up), or null when local already contains everything.
 */
export function absorbRemote(local: Workgroup, remote: Workgroup): Workgroup | null {
  if (remote.id !== local.id) return null;
  const merged = mergeGroups(local, remote);
  return JSON.stringify(merged) === JSON.stringify(local) ? null : merged;
}
