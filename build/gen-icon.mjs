/**
 * gen-icon.mjs — generate the Memora app icon (build/icon.ico) from a vector.
 *
 * Renders the brand mark (a stack of flashcards on the claret gradient — the
 * "scholar's field journal" identity) to PNGs at every size a Windows .ico
 * needs, then packs them into a single multi-resolution icon. Also writes
 * icon.png (512) for docs/other uses.
 *
 * One-off asset script. Run from the project root:  node build/gen-icon.mjs
 * (needs sharp + png-to-ico; install with `npm i -D sharp png-to-ico`).
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const SVG = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a83029"/>
      <stop offset="1" stop-color="#7a201a"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#3a160f" flood-opacity="0.30"/>
    </filter>
  </defs>

  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#tile)"/>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#sheen)"/>

  <!-- flashcard stack, in warm cream -->
  <g filter="url(#sh)">
    <rect x="86" y="72"  width="112" height="76" rx="16" fill="#fbf7ef" opacity="0.42"/>
    <rect x="72" y="88"  width="112" height="76" rx="16" fill="#fbf7ef" opacity="0.70"/>
    <rect x="58" y="104" width="112" height="76" rx="16" fill="#fbf7ef"/>
  </g>
  <!-- text lines on the front card, in claret -->
  <rect x="74" y="126" width="66" height="9" rx="4.5" fill="#9e2b25"/>
  <rect x="74" y="146" width="44" height="9" rx="4.5" fill="#9e2b25" opacity="0.5"/>
</svg>`;

const svgBuf = Buffer.from(SVG);
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(svgBuf, { density: 512 }).resize(s, s, { fit: "contain" }).png().toBuffer(),
  ),
);

const ico = await pngToIco(pngs);
writeFileSync(join(here, "icon.ico"), ico);

// A high-res PNG for README / store listings.
writeFileSync(
  join(here, "icon.png"),
  await sharp(svgBuf, { density: 1024 }).resize(512, 512).png().toBuffer(),
);

console.log("Wrote build/icon.ico (" + sizes.join(",") + ") and build/icon.png");
