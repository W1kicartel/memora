/**
 * gifs.ts — GIF & sticker search for the group chat, powered by Tenor v2
 * (the engine behind GIF search in WhatsApp/Discord — memes included).
 *
 * Tenor API keys are free and DESIGNED to ship inside client apps: create one
 * at console.cloud.google.com (enable "Tenor API" → credentials → API key),
 * put it in `.env` as VITE_TENOR_KEY=… and rebuild. Every installed copy then
 * has working GIF/sticker search out of the box. Without a key the picker
 * degrades gracefully: users can still paste any image URL.
 */

export const TENOR_KEY: string = (import.meta.env.VITE_TENOR_KEY as string | undefined) ?? "";

export const gifSearchAvailable = (): boolean => TENOR_KEY.length > 0;

export interface GifResult {
  id: string;
  /** full-size GIF url — what gets sent into the chat. */
  url: string;
  /** small preview url — what the picker grid shows. */
  preview: string;
  alt: string;
}

interface TenorMediaFormat { url?: string }
interface TenorItem {
  id?: string;
  content_description?: string;
  media_formats?: Record<string, TenorMediaFormat>;
}

/**
 * Search Tenor (or fetch the trending feed when the query is empty).
 * kind "sticker" filters to transparent meme stickers; "gif" is the classic
 * full-frame GIF search.
 */
export async function searchGifs(
  query: string,
  kind: "gif" | "sticker",
  limit = 24,
): Promise<GifResult[]> {
  if (!gifSearchAvailable()) return [];
  const endpoint = query.trim() ? "search" : "featured";
  const p = new URLSearchParams({
    key: TENOR_KEY,
    client_key: "memora",
    limit: String(limit),
    media_filter: "gif,tinygif",
  });
  if (query.trim()) p.set("q", query.trim());
  if (kind === "sticker") p.set("searchfilter", "sticker");

  const res = await fetch(`https://tenor.googleapis.com/v2/${endpoint}?${p.toString()}`);
  if (!res.ok) throw new Error(`Tenor HTTP ${res.status}`);
  const data = (await res.json()) as { results?: TenorItem[] };

  return (data.results ?? []).flatMap((item) => {
    const f = item.media_formats ?? {};
    const url = f.gif?.url ?? f.tinygif?.url;
    if (!url || !item.id) return [];
    return [{
      id: item.id,
      url,
      preview: f.tinygif?.url ?? url,
      alt: item.content_description ?? "GIF",
    }];
  });
}
