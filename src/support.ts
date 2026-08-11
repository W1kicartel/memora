/**
 * support.ts — the in-app Support line to the operator.
 *
 * A ticket carries the chosen category, the message, and just enough context
 * to act on it (member id + name for a targeted reply-notice, app version and
 * edition for debugging). Replies come back as operator notices — the same
 * channel the admin dashboard already uses.
 */

import { syncRpc } from "./sync";
import { loadProfile } from "./workgroup";
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
  });
}
