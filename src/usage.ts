/**
 * usage.ts — anonymous usage heartbeat for the operator dashboard.
 *
 * While the app is open it pings the backend every few minutes; the
 * dashboard turns pings × interval into "time spent". No content, no
 * tracking across sites — just a per-install daily counter, keyed by a
 * random installation id (not the profile, so it works before sign-in).
 *
 * Privacy: this is opt-out-by-uninstall telemetry for a friends-and-family
 * app; it reports edition, version and faculty for aggregate stats, nothing
 * a user typed. Documented in the README's privacy note.
 */

import { syncRpc } from "./sync";
import { loadProfile } from "./workgroup";
import { loadSettings } from "./storage";
import { IS_SOCIAL } from "./edition";
import pkg from "../package.json";

/** Ping cadence — must match admin_stats' `* 5` minute estimate. */
export const PING_MINUTES = 5;

const INSTALL_KEY = "memora:install:v1";

/** Stable per-install id (created once, persisted). Used for usage + as a
 *  fallback address for operator messages when the user has no profile. */
export function installId(): string {
  try {
    let id = localStorage.getItem(INSTALL_KEY);
    if (!id) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(INSTALL_KEY, id);
    }
    return id;
  } catch {
    return "anon-no-storage";
  }
}

async function ping(): Promise<void> {
  // Only ping when the tab is actually in view, so idle background windows
  // don't inflate the time estimate.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    await syncRpc<void>("track_usage", {
      p_install: installId(),
      p_name: loadProfile()?.name ?? "",
      p_edition: IS_SOCIAL ? "social" : "private",
      p_version: (pkg as { version?: string }).version ?? "",
      p_faculty: loadSettings().faculty ?? "",
      p_member: loadProfile()?.id ?? "",
    });
  } catch {
    /* offline / relay down — the next tick retries; telemetry is best-effort */
  }
}

/** Start the heartbeat. Returns a stop function. */
export function startUsageHeartbeat(): () => void {
  void ping(); // one on launch
  const id = window.setInterval(ping, PING_MINUTES * 60_000);
  return () => window.clearInterval(id);
}
