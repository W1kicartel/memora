import { useEffect, useMemo, useState } from "react";
import {
  loadMusic, saveMusic, allTracks,
  startSpotifyAuth, ensureFreshAuth, fetchLibrary, saveToMemoraPlaylist,
  fetchApplePlaylist, refreshAppleLibrary,
  dailyIndex, spotifyTrackEmbed, appleEmbedUrl, appleTrackId,
  MusicError, MEMORA_PLAYLIST, LOOPBACK_REDIRECT,
  type MusicState, type MusicTrack,
} from "./music";
import {
  LOVE_DEDICATIONS, SUPPORT_DEDICATIONS, isDedicationDay, type Dedication,
} from "./dedications";
import { dayStr } from "./life";
import { IconTrash } from "./icons";

/** A dedicated song, shaped like any other track in the daily pool. */
function dedicationTrack(d: Dedication): MusicTrack {
  return {
    id: appleTrackId(d.url),
    name: d.title,
    artists: d.artist,
    cover: "",
    playlistName: "una dedica per te",
    source: "apple",
    url: d.url,
  };
}

const DED_TRACKS = LOVE_DEDICATIONS.map(dedicationTrack);
const DED_TEXT = new Map(LOVE_DEDICATIONS.map((d) => [appleTrackId(d.url), d.text]));

/**
 * "La canzone del giorno" — a small music note pinned to the decks landing,
 * which doubles as the app's bacheca. Sundays (and every day until playlists
 * are linked) the song is one of the gift's dedications, message included;
 * other days it's a deterministic pick from the linked playlists. A quiet
 * "giornata no?" button offers a comfort song from the original gift's
 * support set.
 */
export function SongWidget() {
  const [music, setMusic] = useState<MusicState>(() => loadMusic());
  const [panel, setPanel] = useState(false);
  const [appleUrl, setAppleUrl] = useState("");
  const [clientId, setClientId] = useState(() => loadMusic().spotify?.clientId ?? "");
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [support, setSupport] = useState<Dedication | null>(null);
  const [supportSalt, setSupportSalt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => saveMusic(music), [music]);

  /* Browser-mode OAuth finishes after mount: reload the stored connection. */
  useEffect(() => {
    const onUpdate = () => setMusic(loadMusic());
    window.addEventListener("memora:music-updated", onUpdate);
    return () => window.removeEventListener("memora:music-updated", onUpdate);
  }, []);

  const today = dayStr();
  const libraryTracks = useMemo(() => allTracks(music), [music]);
  const hasSources = Boolean(music.apple?.playlists.length || music.spotify);

  /* Sundays belong to the dedications; so does every day with no playlists. */
  const pool = libraryTracks.length === 0 || isDedicationDay(today) ? DED_TRACKS : libraryTracks;

  const daily = useMemo<MusicTrack | null>(() => {
    if (pool.length === 0) return null;
    if (music.daily?.date === today) {
      const found = pool.find((t) => t.id === music.daily!.trackId);
      if (found) return found;
    }
    return pool[dailyIndex(today, pool.length)] ?? null;
  }, [music.daily, pool, today]);

  useEffect(() => {
    if (daily && music.daily?.date !== today) {
      setMusic((m) => ({ ...m, daily: { date: today, trackId: daily.id, rerolls: 0 } }));
    }
  }, [daily, music.daily, today]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null); setNotice(null);
    try { await fn(); }
    catch (e) { setError(e instanceof MusicError ? e.message : "Qualcosa è andato storto."); }
    finally { setBusy(null); }
  };

  const addApple = () => run("apple", async () => {
    const url = appleUrl.trim();
    if (!url) return;
    if (music.apple?.playlists.some((p) => p.url === url)) {
      throw new MusicError("Questa playlist è già collegata.");
    }
    const { ref, tracks: t } = await fetchApplePlaylist(url);
    setMusic((m) => {
      const existing = m.apple ?? { fetchedAt: 0, playlists: [], tracks: [] };
      const known = new Set(existing.tracks.map((x) => x.id));
      return {
        ...m,
        apple: {
          fetchedAt: Date.now(),
          playlists: [...existing.playlists, ref],
          tracks: [...existing.tracks, ...t.filter((x) => !known.has(x.id))],
        },
      };
    });
    setAppleUrl("");
    setNotice(`«${ref.name}» collegata: ${ref.count} brani nel mazzo. ♪`);
  });

  const removeApple = (url: string) => {
    setMusic((m) => {
      if (!m.apple) return m;
      const playlists = m.apple.playlists.filter((p) => p.url !== url);
      const removedName = m.apple.playlists.find((p) => p.url === url)?.name;
      const tracks = m.apple.tracks.filter((t) => t.playlistName !== removedName);
      return { ...m, apple: playlists.length ? { ...m.apple, playlists, tracks } : null };
    });
  };

  const connectSpotify = () => run("spotify", async () => {
    const result = await startSpotifyAuth(clientId.trim());
    if (result === "redirecting") return;
    const library = await fetchLibrary(result);
    setMusic((m) => ({ ...m, spotify: result, library }));
    setSpotifyOpen(false);
  });

  const reroll = () => {
    if (pool.length === 0) return;
    const rerolls = (music.daily?.rerolls ?? 0) + 1;
    const next = pool[dailyIndex(today, pool.length, rerolls)];
    setMusic((m) => ({ ...m, daily: { date: today, trackId: next.id, rerolls } }));
  };

  const saveDaily = () => run("save", async () => {
    if (!music.spotify || !daily || daily.source !== "spotify") return;
    const auth = await ensureFreshAuth(music.spotify);
    await saveToMemoraPlaylist(auth, daily.id);
    setMusic((m) => ({ ...m, spotify: auth }));
    setNotice(`Salvata in «${MEMORA_PLAYLIST}» ♥`);
  });

  const refresh = () => run("refresh", async () => {
    let next = music;
    if (music.apple?.playlists.length) {
      const apple = await refreshAppleLibrary(music.apple.playlists);
      next = { ...next, apple };
    }
    if (music.spotify) {
      const auth = await ensureFreshAuth(music.spotify);
      const library = await fetchLibrary(auth);
      next = { ...next, spotify: auth, library };
    }
    setMusic(next);
    setNotice("Libreria aggiornata.");
  });

  const comfort = () => {
    setSupport(SUPPORT_DEDICATIONS[supportSalt % SUPPORT_DEDICATIONS.length]);
    setSupportSalt((s) => s + 1);
  };

  /* What's on the turntable: a comfort song overrides the daily one. */
  const shown = support ? dedicationTrack(support) : daily;
  const shownText = support ? support.text : (shown && DED_TEXT.get(shown.id)) || null;
  const embedSrc = shown
    ? shown.source === "apple"
      ? (shown.url ? appleEmbedUrl(shown.url) : null)
      : spotifyTrackEmbed(shown.id)
    : null;
  const openHref = shown
    ? shown.source === "apple" ? shown.url : `https://open.spotify.com/track/${shown.id}`
    : undefined;

  const sourcesPanel = (
    <div className="song-pin-setup">
      <p className="song-pin-hint">
        Incolla il link di una playlist <strong>pubblica</strong> di Apple Music
        (app Apple Music → playlist → ⋯ → Condividi → Copia link).
      </p>
      <div className="row">
        <input
          value={appleUrl}
          onChange={(e) => setAppleUrl(e.target.value)}
          placeholder="https://music.apple.com/it/playlist/…"
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && addApple()}
        />
        <button className="primary" disabled={!appleUrl.trim() || busy !== null} onClick={addApple}>
          {busy === "apple" ? "Leggo…" : "Aggiungi"}
        </button>
      </div>
      {music.apple && music.apple.playlists.length > 0 && (
        <ul className="song-pin-sources">
          {music.apple.playlists.map((p) => (
            <li key={p.url}>
              <span> «{p.name}» · {p.count} brani</span>
              <button className="icon danger" title="Rimuovi playlist" onClick={() => removeApple(p.url)}>
                <IconTrash size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!music.spotify && (
        !spotifyOpen ? (
          <p className="song-pin-hint">
            Usa Spotify? <button className="link small" onClick={() => setSpotifyOpen(true)}>Collega il profilo</button>
          </p>
        ) : (
          <>
            <p className="song-pin-hint">
              Serve un'app gratuita su{" "}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a>{" "}
              con redirect URI <code>{LOOPBACK_REDIRECT}</code>: incolla qui il suo Client ID.
            </p>
            <div className="row">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID Spotify…"
                style={{ flex: 1 }}
                autoComplete="off"
              />
              <button className="ghost small" disabled={!clientId.trim() || busy !== null} onClick={connectSpotify}>
                {busy === "spotify" ? "Collego…" : "Collega"}
              </button>
            </div>
          </>
        )
      )}
      {music.spotify && (
        <p className="song-pin-hint">
          Spotify: <strong>{music.spotify.profileName}</strong>{" "}
          <button
            className="link small subtle"
            onClick={() => setMusic((m) => ({ ...m, spotify: null, library: null }))}
          >
            scollega
          </button>
        </p>
      )}
    </div>
  );

  return (
    <aside className="song-pin">
      <div className="song-pin-head">
        <span className="song-pin-eyebrow">
          {support ? "🌧 Per una giornata storta" : "♪ La canzone di oggi"}
        </span>
        {shown && !support && <span className="song-pin-from">da «{shown.playlistName}»</span>}
        <button
          className="link small subtle song-pin-manage"
          onClick={() => setPanel(!panel)}
        >
          {panel ? "Chiudi" : "Playlist"}
        </button>
      </div>

      {shown && embedSrc && (
        <iframe
          key={shown.id + (support ? "-sos" : "")}
          className={shown.source === "apple" ? "song-pin-embed apple" : "song-pin-embed"}
          src={embedSrc}
          title={`${shown.name} — ${shown.artists}`}
          loading="lazy"
          allow="autoplay *; clipboard-write; encrypted-media *; fullscreen *; picture-in-picture"
        />
      )}

      {shownText && (
        <p className="song-pin-dedica">
          {shownText}
          <span className="song-pin-dedica-sig">— per te ♥</span>
        </p>
      )}

      <div className="song-pin-actions">
        {support ? (
          <>
            <button className="link small" onClick={comfort}>Un'altra</button>
            <button className="link small" onClick={() => setSupport(null)}>Torna a oggi</button>
          </>
        ) : (
          <>
            <button className="link small" onClick={reroll}>Un'altra</button>
            {shown?.source === "spotify" && music.spotify && (
              <button className="link small" disabled={busy !== null} onClick={saveDaily} title={`Salva in «${MEMORA_PLAYLIST}»`}>
                {busy === "save" ? "Salvo…" : "Salva ♥"}
              </button>
            )}
            {openHref && <a href={openHref} target="_blank" rel="noreferrer">Apri</a>}
          </>
        )}
        <span className="song-pin-gap" />
        {!support && (
          <button className="link small subtle" onClick={comfort} title="Una canzone per le giornate difficili">
            Giornata no?
          </button>
        )}
        {hasSources && !support && (
          <button className="link small subtle" disabled={busy !== null} onClick={refresh} title="Ricarica i brani dalle playlist">
            {busy === "refresh" ? "…" : "Aggiorna"}
          </button>
        )}
      </div>

      {!hasSources && !panel && (
        <p className="song-pin-hint">
          Collega le tue playlist e nei giorni feriali la canzone arriva da lì —{" "}
          <button className="link small" onClick={() => setPanel(true)}>aggiungile qui</button>.
        </p>
      )}
      {panel && sourcesPanel}

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="ok-text">{notice}</p>}
    </aside>
  );
}
