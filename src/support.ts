/**
 * support.ts — the in-app Support line to the operator.
 *
 * A ticket carries the chosen category, the message, and just enough context
 * to act on it (member id + name for a targeted reply-notice, app version and
 * edition for debugging). Replies come back as operator notices — the same
 * channel the admin dashboard already uses.
 */

import { syncRpc } from "./sync";
import { loadProfile, loadGroups } from "./workgroup";
import { installId } from "./usage";
import { IS_SOCIAL } from "./edition";
import pkg from "../package.json";

export const SUPPORT_CATEGORIES = [
  { id: "bug",      label: "🐞 Qualcosa non funziona" },
  { id: "idea",     label: "💡 Proposta: una nuova funzione" },
  { id: "question", label: "❓ Aiuto: non capisco come si usa" },
  { id: "content",  label: "🚩 Segnalo contenuti inappropriati in un gruppo" },
  { id: "data",     label: "💾 Problemi con i miei dati (backup, sync)" },
  { id: "other",    label: "✉️ Altro" },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["id"];

export async function sendSupport(category: SupportCategory, message: string): Promise<void> {
  const profile = loadProfile();
  await syncRpc<string>("send_support", {
    p_member_id: profile?.id ?? "",
    p_name: profile?.name ?? "",
    p_category: category,
    p_message: message.trim(),
    p_version: (pkg as { version?: string }).version ?? "",
    p_edition: IS_SOCIAL ? "social" : "private",
    p_install: installId(),
  });
}

/* ─── the conversation ────────────────────────────────────────────────────── */

export interface ThreadMessage {
  id: string;
  /** "me" = the user's own message; "batman" = the operator's reply. */
  role: "me" | "batman";
  text: string;
  at: number;
}

interface MyTicket { id: string; category: string; message: string; created_at: string }
interface MyNotice { id: string; title: string; body: string; created_at: string }

/**
 * Build the support conversation: the user's own tickets and the operator's
 * replies (notices addressed to them), merged in time order. It's a chat.
 */
export async function fetchSupportThread(): Promise<ThreadMessage[]> {
  const profile = loadProfile();
  const syncIds = loadGroups().map((g) => g.syncId).filter((s): s is string => Boolean(s));

  const [tickets, notices] = await Promise.all([
    syncRpc<MyTicket[] | null>("get_my_support", { p_install: installId() }),
    syncRpc<MyNotice[] | null>("get_notices", {
      p_member_id: profile?.id ?? "",
      p_sync_ids: syncIds,
      p_install_id: installId(),
    }),
  ]);

  const mine: ThreadMessage[] = (tickets ?? []).map((t) => ({
    id: t.id, role: "me", text: t.message, at: new Date(t.created_at).getTime(),
  }));
  const theirs: ThreadMessage[] = (notices ?? []).map((n) => ({
    id: n.id, role: "batman",
    text: n.body ? `${n.title}\n${n.body}` : n.title,
    at: new Date(n.created_at).getTime(),
  }));

  return [...mine, ...theirs].sort((a, b) => a.at - b.at);
}
