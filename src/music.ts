/**
 * music.ts — the pure core of the Music module.
 *
 * Spotify: full integration via OAuth 2.0 Authorization Code + PKCE (the flow
 * designed for apps that cannot keep a secret — no backend needed). The user
 * registers a free app on developer.spotify.com once and pastes its client ID.
 * In Electron the redirect lands on a temporary loopback server opened by the
 * main process; in a dev browser it round-trips through the SPA itself.
 *
 * Apple Music: no paid MusicKit token needed. Public playlist pages on
 * music.apple.com embed their track list as schema.org ld+json — we fetch the
 * page (Electron main process, or the Vite dev proxy) and parse it. Playback
 * goes through the official embed player, which needs no key either. The only
 * requirement: the playlist must be public (Apple Music → ⋯ → Condividi).
 *
 * "La canzone del giorno": a deterministic daily pick from the union of the
 * connected sources' tracks — same day, same song, until you ask for another.
 * Surfaced as a mini-widget pinned to the decks landing (the "bacheca").
 */

export class MusicError extends Error {}

/* ─── types ──────────────────────────────────────────────────────────────── */

export interface SpotifyAuth {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  /** ms epoch when accessToken dies. */
  expiresAt: number;
  profileName: string;
  profileId: string;
}

export interface MusicTrack {
  id: string;
  name: string;
  artists: string;
  /** cover art url (may be ""). */
  cover: string;
  /** name of the playlist it was found in. */
  playlistName: string;
  /** which service the track lives on. */
  source: "spotify" | "apple";
  /** canonical page url (Apple tracks; Spotify derives it from the id). */
  url?: string;
}

export interface PlaylistMeta {
  id: string;
  name: string;
  count: number;
  cover: string;
  url: string;
}

export interface MusicLibrary {
  fetchedAt: number;
  playlists: PlaylistMeta[];
  tracks: MusicTrack[];
}

export interface ApplePlaylistRef {
  url: string;
  name: string;
  count: number;
}

export interface AppleLibrary {
  fetchedAt: number;
  playlists: ApplePlaylistRef[];
  tracks: MusicTrack[];
}

export interface DailyPick {
  date: string;      // YYYY-MM-DD
  trackId: string;
  rerolls: number;
}

export interface MusicState {
  spotify: SpotifyAuth | null;
  library: MusicLibrary | null;
  apple: AppleLibrary | null;
  daily: DailyPick | null;
}

export function defaultMusic(): MusicState {
  return { spotify: null, library: null, apple: null, daily: null };
}

/** The daily-pick pool: every track from every connected source. */
export function allTracks(state: MusicState): MusicTrack[] {
  return [...(state.library?.tracks ?? []), ...(state.apple?.tracks ?? [])];
}

/* ─── persistence ────────────────────────────────────────────────────────── */

const KEY = "memora:music:v1";

export function loadMusic(): MusicState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMusic();
    return { ...defaultMusic(), ...(JSON.parse(raw) as Partial<MusicState>) };
  } catch {
    return defaultMusic();
  }
}

export function saveMusic(state: MusicState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* quota/private mode — ignore */ }
}

/* ─── pure helpers (tested in music.test.ts) ─────────────────────────────── */

/** FNV-1a — small, deterministic, good enough to spread days over a library. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic index of today's song; `salt` bumps to a fresh proposal. */
export function dailyIndex(dateStr: string, poolSize: number, salt = 0): number {
  if (poolSize <= 0) return -1;
  return fnv1a(`${dateStr}#${salt}`) % poolSize;
}

/** open.spotify.com embed for one track. */
export function spotifyTrackEmbed(trackId: string): string {
  return `https://open.spotify.com/embed/track/${trackId}`;
}

/** music.apple.com page url → official embed url (null if not Apple Music). */
export function appleEmbedUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.hostname === "embed.music.apple.com") return u.href;
  if (u.hostname !== "music.apple.com") return null;
  if (u.pathname.length < 2) return null;
  return `https://embed.music.apple.com${u.pathname}${u.search}`;
}

/** Stable id for an Apple track url: the ?i= param, else the last path id. */
export function appleTrackId(url: string): string {
  try {
    const u = new URL(url);
    const i = u.searchParams.get("i");
    if (i) return `apple:${i}`;
    const last = u.pathname.split("/").filter(Boolean).pop() ?? url;
    return `apple:${last}`;
  } catch {
    return `apple:${url}`;
  }
}

/**
 * Extract the track list from a public music.apple.com playlist/album page.
 * The page ships a schema.org ld+json block (MusicPlaylist / MusicAlbum) with
 * name + track urls — stable, documented markup, no API key involved.
 */
export function parseApplePlaylist(html: string): {
  name: string;
  tracks: { name: string; artists: string; url: string }[];
} | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    for (const o of Array.isArray(data) ? data : [data]) {
      const obj = o as { "@type"?: string; name?: unknown; track?: unknown; tracks?: unknown };
      if (obj?.["@type"] !== "MusicPlaylist" && obj?.["@type"] !== "MusicAlbum") continue;
      const list = (obj.track ?? obj.tracks ?? []) as Array<{
        name?: unknown; url?: unknown;
        byArtist?: { name?: unknown } | Array<{ name?: unknown }>;
      }>;
      if (!Array.isArray(list)) continue;
      const tracks = list
        .map((x) => {
          const by = x?.byArtist;
          const artists = Array.isArray(by)
            ? by.map((a) => String(a?.name ?? "")).filter(Boolean).join(", ")
            : String(by?.name ?? "");
          return {
            name: String(x?.name ?? "").trim(),
            artists: artists.trim(),
            url: String(x?.url ?? "").trim(),
          };
        })
        .filter((x) => x.name && x.url.includes("music.apple.com"));
      if (tracks.length) return { name: String(obj.name ?? "Apple Music").trim(), tracks };
    }
  }
  return null;
}

/* ─── Apple Music (public playlists, no token) ───────────────────────────── */

/** Fetch a public playlist page: Electron main in the app, Vite proxy in dev. */
async function fetchApplePage(url: string): Promise<string> {
  const u = new URL(url.trim());
  if (u.hostname !== "music.apple.com") {
    throw new MusicError("Quello non sembra un link di Apple Music (music.apple.com/…).");
  }
  const bridge = window.memoraAI?.fetchApplePage;
  if (bridge) {
    const r = await bridge(u.href);
    if (r.error || !r.html) throw new MusicError(r.error || "Pagina Apple Music non raggiungibile.");
    return r.html;
  }
  const res = await fetch(`/amx${u.pathname}${u.search}`);
  if (!res.ok) throw new MusicError(`Pagina Apple Music non raggiungibile (HTTP ${res.status}).`);
  return res.text();
}

/** Load one public playlist url into tracks for the daily pool. */
export async function fetchApplePlaylist(url: string): Promise<{ ref: ApplePlaylistRef; tracks: MusicTrack[] }> {
  const html = await fetchApplePage(url);
  const parsed = parseApplePlaylist(html);
  if (!parsed) {
    throw new MusicError(
      "Non riesco a leggere i brani da questo link: controlla che la playlist sia PUBBLICA (Apple Music → ⋯ → Condividi) e riprova.",
    );
  }
  const tracks: MusicTrack[] = parsed.tracks.map((t) => ({
    id: appleTrackId(t.url),
    name: t.name,
    artists: t.artists,
    cover: "",
    playlistName: parsed.name,
    source: "apple",
    url: t.url,
  }));
  return { ref: { url: url.trim(), name: parsed.name, count: tracks.length }, tracks };
}

/** Re-fetch every saved Apple playlist (used by "Aggiorna"). */
export async function refreshAppleLibrary(refs: ApplePlaylistRef[]): Promise<AppleLibrary> {
  const playlists: ApplePlaylistRef[] = [];
  const tracks: MusicTrack[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const { ref: fresh, tracks: t } = await fetchApplePlaylist(ref.url);
    playlists.push(fresh);
    for (const tr of t) {
      if (seen.has(tr.id)) continue;
      seen.add(tr.id);
      tracks.push(tr);
    }
  }
  return { fetchedAt: Date.now(), playlists, tracks };
}

/* ─── Spotify OAuth (PKCE) ───────────────────────────────────────────────── */

const SPOTIFY_AUTH = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";
export const LOOPBACK_PORT = 43110;
export const LOOPBACK_REDIRECT = `http://127.0.0.1:${LOOPBACK_PORT}/callback`;
const SCOPES = "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public";

const PENDING_KEY = "memora:spotify:pending";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

function authUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  return `${SPOTIFY_AUTH}?${q}`;
}

async function exchangeCode(
  clientId: string, code: string, redirectUri: string, verifier: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const res = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new MusicError(`Scambio del codice fallito (HTTP ${res.status}). Controlla client ID e redirect URI.`);
  const j = await res.json();
  return {
    accessToken: String(j.access_token),
    refreshToken: String(j.refresh_token ?? ""),
    expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000 - 60_000,
  };
}

/** Refresh when needed; returns a valid auth (possibly updated — persist it). */
export async function ensureFreshAuth(auth: SpotifyAuth): Promise<SpotifyAuth> {
  if (Date.now() < auth.expiresAt) return auth;
  const res = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: auth.clientId,
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken,
    }),
  });
  if (!res.ok) throw new MusicError("Sessione Spotify scaduta: ricollega il profilo.");
  const j = await res.json();
  return {
    ...auth,
    accessToken: String(j.access_token),
    refreshToken: String(j.refresh_token ?? auth.refreshToken),
    expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000 - 60_000,
  };
}

/**
 * Connect a Spotify account. In Electron the main process opens the system
 * browser and catches the redirect on a loopback server; in a plain browser
 * we navigate away and `completeSpotifyBrowserAuth` finishes on return.
 */
export async function startSpotifyAuth(clientId: string): Promise<SpotifyAuth | "redirecting"> {
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));

  const bridge = window.memoraAI?.authorizeSpotify;
  if (bridge) {
    const url = authUrl(clientId, LOOPBACK_REDIRECT, challenge, state);
    const { code } = await bridge(url, LOOPBACK_PORT);
    const tokens = await exchangeCode(clientId, code, LOOPBACK_REDIRECT, verifier);
    return finishAuth(clientId, tokens);
  }

  const redirectUri = `${window.location.origin}/callback`;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, clientId, redirectUri }));
  window.location.href = authUrl(clientId, redirectUri, challenge, state);
  return "redirecting";
}

/** Call once at app start: finishes a browser-mode redirect if one is pending. */
export async function completeSpotifyBrowserAuth(): Promise<SpotifyAuth | null> {
  if (window.location.pathname !== "/callback") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = sessionStorage.getItem(PENDING_KEY);
  window.history.replaceState(null, "", "/");
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  const pending = JSON.parse(raw) as { verifier: string; state: string; clientId: string; redirectUri: string };
  const code = params.get("code");
  if (!code || params.get("state") !== pending.state) {
    throw new MusicError(params.get("error") === "access_denied" ? "Accesso a Spotify annullato." : "Risposta di Spotify non valida.");
  }
  const tokens = await exchangeCode(pending.clientId, code, pending.redirectUri, pending.verifier);
  const auth = await finishAuth(pending.clientId, tokens);
  const st = loadMusic();
  saveMusic({ ...st, spotify: auth });
  return auth;
}

async function finishAuth(
  clientId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
): Promise<SpotifyAuth> {
  const me = await apiGet<{ id: string; display_name?: string }>(tokens.accessToken, "/me");
  return {
    clientId,
    ...tokens,
    profileId: me.id,
    profileName: me.display_name || me.id,
  };
}

/* ─── Spotify Web API ────────────────────────────────────────────────────── */

async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new MusicError("Spotify chiede una pausa (429). Riprova tra qualche secondo.");
  if (!res.ok) throw new MusicError(`Errore Spotify (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

async function apiSend<T>(token: string, method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new MusicError(`Errore Spotify (HTTP ${res.status}).`);
  return (await res.json().catch(() => ({}))) as T;
}

interface RawPlaylist {
  id: string; name: string;
  tracks: { total: number };
  images?: { url: string }[];
  external_urls?: { spotify?: string };
}

/** Fetch the profile's playlists + a track pool for the daily pick. */
export async function fetchLibrary(auth: SpotifyAuth): Promise<MusicLibrary> {
  const page = await apiGet<{ items: RawPlaylist[] }>(auth.accessToken, "/me/playlists?limit=50");
  const playlists: PlaylistMeta[] = page.items.map((p) => ({
    id: p.id,
    name: p.name,
    count: p.tracks?.total ?? 0,
    cover: p.images?.[0]?.url ?? "",
    url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
  }));

  // Track pool: the 12 biggest playlists, one page (100 tracks) each — enough
  // for years of daily songs without hammering the API.
  const pool = [...playlists].sort((a, b) => b.count - a.count).slice(0, 12);
  const tracks: MusicTrack[] = [];
  const seen = new Set<string>();
  for (const pl of pool) {
    const t = await apiGet<{ items: { track: { id?: string; name?: string; artists?: { name: string }[]; album?: { images?: { url: string }[] } } | null }[] }>(
      auth.accessToken,
      `/playlists/${pl.id}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images)))`,
    );
    for (const item of t.items) {
      const tr = item.track;
      if (!tr?.id || seen.has(tr.id)) continue;
      seen.add(tr.id);
      tracks.push({
        id: tr.id,
        name: tr.name ?? "?",
        artists: (tr.artists ?? []).map((a) => a.name).join(", "),
        cover: tr.album?.images?.[0]?.url ?? "",
        playlistName: pl.name,
        source: "spotify",
      });
    }
  }
  if (tracks.length === 0) throw new MusicError("Nessun brano trovato nelle playlist del profilo.");
  return { fetchedAt: Date.now(), playlists, tracks };
}

export const MEMORA_PLAYLIST = "Memora ♥";

/** Add a track to the private "Memora ♥" playlist, creating it if missing. */
export async function saveToMemoraPlaylist(auth: SpotifyAuth, trackId: string): Promise<void> {
  const page = await apiGet<{ items: RawPlaylist[] }>(auth.accessToken, "/me/playlists?limit=50");
  let target = page.items.find((p) => p.name === MEMORA_PLAYLIST);
  if (!target) {
    target = await apiSend<RawPlaylist>(auth.accessToken, "POST", `/users/${encodeURIComponent(auth.profileId)}/playlists`, {
      name: MEMORA_PLAYLIST,
      public: false,
      description: "Le canzoni del giorno proposte da Memora.",
    });
  }
  await apiSend(auth.accessToken, "POST", `/playlists/${target.id}/tracks`, {
    uris: [`spotify:track:${trackId}`],
  });
}
