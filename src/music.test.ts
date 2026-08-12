/**
 * Dependency-free tests for the Music module's pure core.
 * Run with:  npx tsx src/music.test.ts
 */
import {
  fnv1a, dailyIndex, spotifyTrackEmbed,
  appleEmbedUrl, appleTrackId, deezerEmbedUrl, deezerTrackId, parseApplePlaylist,
} from "./music";
import { LOVE_DEDICATIONS, SUPPORT_DEDICATIONS, isDedicationDay } from "./dedications";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

// --- fnv1a / dailyIndex -----------------------------------------------------
{
  assert(fnv1a("2026-08-08") === fnv1a("2026-08-08"), "hash is deterministic");
  assert(fnv1a("2026-08-08") !== fnv1a("2026-08-09"), "different days differ");

  assert(dailyIndex("2026-08-08", 100) === dailyIndex("2026-08-08", 100), "same day → same song");
  assert(dailyIndex("2026-08-08", 100, 0) !== dailyIndex("2026-08-08", 100, 1) ||
         dailyIndex("2026-08-08", 100, 1) !== dailyIndex("2026-08-08", 100, 2),
         "a reroll can land on a new song");
  assert(dailyIndex("2026-08-08", 0) === -1, "empty pool → -1");
  const idx = dailyIndex("2026-08-08", 7);
  assert(idx >= 0 && idx < 7, "index stays inside the pool");

  // Distribution sanity: 30 consecutive days over 10 songs must not all collide.
  const hits = new Set<number>();
  for (let d = 1; d <= 30; d++) hits.add(dailyIndex(`2026-09-${String(d).padStart(2, "0")}`, 10));
  assert(hits.size >= 5, "a month of picks spreads across the pool");
}

// --- embed urls -------------------------------------------------------------
{
  assert(spotifyTrackEmbed("abc123") === "https://open.spotify.com/embed/track/abc123", "track embed url");

  assert(
    appleEmbedUrl("https://music.apple.com/it/album/song-x/144?i=145") ===
      "https://embed.music.apple.com/it/album/song-x/144?i=145",
    "apple song link → embed (query kept)",
  );
  assert(appleEmbedUrl("https://open.spotify.com/track/x") === null, "non-apple link rejected");
  assert(appleEmbedUrl("garbage") === null, "garbage rejected");
}

// --- appleTrackId -----------------------------------------------------------
{
  assert(appleTrackId("https://music.apple.com/it/album/x/144?i=145") === "apple:145", "id from ?i= param");
  assert(appleTrackId("https://music.apple.com/it/album/x/144") === "apple:144", "id falls back to path");
  assert(appleTrackId("garbage").startsWith("apple:"), "garbage still yields an id");
}

// --- parseApplePlaylist -----------------------------------------------------
{
  const page = `<html><head>
    <script type="application/ld+json">{"@context":"http://schema.org","@type":"WebSite","name":"Apple Music"}</script>
    <script id="schema:music-playlist" type="application/ld+json">
    {"@context":"http://schema.org","@type":"MusicPlaylist","name":"le nostre canzoni",
     "track":[
       {"@type":"MusicRecording","name":"Amsterdam","url":"https://music.apple.com/it/album/amsterdam/17?i=18","byArtist":{"name":"Nothing But Thieves"}},
       {"@type":"MusicRecording","name":"La Nuova Stella Di Broadway","url":"https://music.apple.com/it/album/x/21?i=22","byArtist":[{"name":"Cesare Cremonini"}]},
       {"@type":"MusicRecording","name":"Senza url resta fuori"}
     ]}
    </script></head><body></body></html>`;
  const parsed = parseApplePlaylist(page);
  assert(parsed !== null, "playlist page parses");
  assert(parsed!.name === "le nostre canzoni", "playlist name extracted");
  assert(parsed!.tracks.length === 2, "only tracks with a url survive");
  assert(parsed!.tracks[0].artists === "Nothing But Thieves", "single byArtist extracted");
  assert(parsed!.tracks[1].artists === "Cesare Cremonini", "byArtist array extracted");

  assert(parseApplePlaylist("<html>no data here</html>") === null, "page without ld+json → null");
  assert(
    parseApplePlaylist('<script type="application/ld+json">{"@type":"MusicPlaylist","name":"vuota","track":[]}</script>') === null,
    "empty playlist → null",
  );
}

// --- dedications ------------------------------------------------------------
{
  const all = [...LOVE_DEDICATIONS, ...SUPPORT_DEDICATIONS];
  // 300 love notes = a song and a message for every day, ~10 months before any repeat.
  assert(LOVE_DEDICATIONS.length === 300, "300 love dedications — one per day");
  assert(SUPPORT_DEDICATIONS.length === 3, "the comfort set is intact");
  assert(all.every((d) => d.text.length > 30), "every dedication keeps its message");
  // All resolve to a Deezer track the embed player can load.
  assert(all.every((d) => deezerEmbedUrl(d.url) !== null), "every dedication is playable via the Deezer embed");
  const ids = new Set(all.map((d) => deezerTrackId(d.url)));
  assert(ids.size === all.length, "dedication track ids are unique (no daily-pick collisions)");
  assert(all.every((d) => !/Ã|â€/.test(d.text)), "no mojibake survives in the texts");

  // Every day is a dedication day now: a song and a note, never a gap.
  assert(isDedicationDay("2026-08-09") === true, "a day is a dedication day");
  assert(isDedicationDay("2026-08-10") === true, "so is the next — no day skipped");
}

console.log(`\nMusic tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
