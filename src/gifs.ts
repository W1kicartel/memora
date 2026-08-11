/**
 * gifs.ts — GIF & sticker search for the group chat, powered by KLIPY.
 *
 * History note: this originally used Tenor, but Google shut the Tenor API
 * down for good on 2026-06-30 (even Discord/WhatsApp had to migrate). KLIPY
 * — built by ex-Tenor folks — exposes a Tenor-compatible API: same request
 * shape, same media_formats response, different base URL and key.
 *
 * Keys are free and made to ship inside client apps: create one at
 * partner.klipy.com (API Keys → create platform), put it in `.env` as
 * VITE_KLIPY_KEY=… and rebuild. Test keys are capped at 100 requests/hour;
 * request production access from the same panel when the app goes wide.
 * Without a key the picker degrades gracefully: users can still paste any
 * image URL.
 *
 * Compliance (KLIPY integration requirements): results are shown in the
 * order returned, media loads straight from their CDN, and the picker
 * carries a "powered by KLIPY" attribution line.
 */

export const KLIPY_KEY: string = (import.meta.env.VITE_KLIPY_KEY as string | undefined) ?? "";

export const gifSearchAvailable = (): boolean => KLIPY_KEY.length > 0;

export interface GifResult {
  id: string;
  /** full-size GIF url — what gets sent into the chat. */
  url: string;
  /** small preview url — what the picker grid shows. */
  preview: string;
  alt: string;
}

interface MediaFormat { url?: string }
interface ApiItem {
  id?: string | number;
  content_description?: string;
  media_formats?: Record<string, MediaFormat>;
}

/**
 * Search KLIPY (or fetch the trending feed when the query is empty).
 * kind "sticker" filters to meme stickers (transparent formats); "gif" is
 * the classic full-frame GIF search.
 */
export async function searchGifs(
  query: string,
  kind: "gif" | "sticker",
  limit = 24,
): Promise<GifResult[]> {
  if (!gifSearchAvailable()) return [];
  const endpoint = query.trim() ? "search" : "featured";
  const p = new URLSearchParams({
    key: KLIPY_KEY,
    client_key: "memora",
    limit: String(limit),
    media_filter: "gif,tinygif",
    locale: "it_IT",
    country: "IT",
  });
  if (query.trim()) p.set("q", query.trim());
  if (kind === "sticker") p.set("searchfilter", "sticker");

  const res = await fetch(`https://api.klipy.com/v2/${endpoint}?${p.toString()}`);
  if (!res.ok) throw new Error(`KLIPY HTTP ${res.status}`);
  const data = (await res.json()) as { results?: ApiItem[] };

  return (data.results ?? []).flatMap((item) => {
    const f = item.media_formats ?? {};
    const url = f.gif?.url ?? f.tinygif?.url;
    if (!url || item.id == null) return [];
    return [{
      id: String(item.id),
      url,
      preview: f.tinygif?.url ?? url,
      alt: item.content_description ?? "GIF",
    }];
  });
}
