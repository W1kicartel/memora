/**
 * make-music.mjs — an original music-box lullaby for the Memora cartoon.
 * Pure synthesis (sine partials with exponential decay), no samples, no
 * copyrighted material: the tune is composed right here.
 *
 *   node make-music.mjs   →  writes carillon.wav (stereo, 44.1 kHz, ~40 s)
 */
import { writeFileSync } from "fs";

const SR = 44100, DUR = 40;
const L = new Float64Array(SR * DUR);

/* note name → frequency (A4 = 440) */
function freq(name) {
  const m = name.match(/^([A-G])(#?)(\d)$/);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

/* one music-box pluck */
function pluck(t0, note, amp = 0.5, decay = 2.6) {
  const f = freq(note);
  const start = Math.round(t0 * SR);
  const len = Math.min(Math.round(3.8 * SR), L.length - start);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * decay) * Math.min(1, t * 220);   // soft attack, long ring
    const v =
      Math.sin(2 * Math.PI * f * t) * 0.72 +
      Math.sin(4 * Math.PI * f * t) * 0.20 * Math.exp(-t * 4.5) +
      Math.sin(6 * Math.PI * f * t) * 0.07 * Math.exp(-t * 7);
    L[start + i] += amp * env * v;
  }
}

/* ── the composition ─────────────────────────────────────────────────────
   16 bars of 2.4 s (≈100 bpm arpeggio pulse), C major lullaby:
   C · G · Am · F, arpeggios below, a slow melody floating above.        */

const BAR = 2.4, STEP = 0.6;
const ARPS = {
  C:  ["C4", "E4", "G4", "C5"],
  G:  ["B3", "D4", "G4", "B4"],
  Am: ["A3", "C4", "E4", "A4"],
  F:  ["F3", "A3", "C4", "F4"],
};
const PROG = ["C", "G", "Am", "F", "C", "G", "Am", "F", "F", "C", "Am", "G", "C", "G", "F", "C"];

/* melody: [bar, beatOffset, note, amp] — enters on the second cycle */
const MELODY = [
  [4, 0, "E5", .42], [4, 1.2, "D5", .38],
  [5, 0, "B4", .40], [5, 1.2, "D5", .36],
  [6, 0, "C5", .42], [6, 1.2, "A4", .36],
  [7, 0, "A4", .38], [7, 1.2, "G4", .34],
  [8, 0, "F5", .42], [8, 1.2, "E5", .38],
  [9, 0, "E5", .40], [9, 1.2, "G5", .38],
  [10, 0, "A5", .40], [10, 1.2, "E5", .36],
  [11, 0, "D5", .40], [11, 1.6, "B4", .34],
  [12, 0, "C5", .44], [12, 1.2, "E5", .38],
  [13, 0, "D5", .40], [13, 1.2, "B4", .34],
  [14, 0, "A4", .38], [14, 1.2, "C5", .36],
  [15, 0, "C5", .46],
];

PROG.forEach((chord, bar) => {
  const t0 = bar * BAR;
  ARPS[chord].forEach((n, i) => pluck(t0 + i * STEP, n, i === 0 ? 0.34 : 0.26, 2.2));
});
MELODY.forEach(([bar, off, n, a]) => pluck(bar * BAR + off, n, a, 1.9));

/* closing chime: a little C-major bloom that rings into the fade */
["C4", "G4", "E5", "C6"].forEach((n, i) => pluck(15 * BAR + 1.2 + i * 0.09, n, 0.34, 1.1));

/* normalize to a gentle level */
let peak = 0;
for (const v of L) peak = Math.max(peak, Math.abs(v));
const gain = 0.62 / peak;

/* stereo: right channel slightly delayed for width (Haas) */
const DELAY = Math.round(0.011 * SR);
const pcm = Buffer.alloc(SR * DUR * 4);
for (let i = 0; i < SR * DUR; i++) {
  const l = L[i] * gain;
  const r = (i >= DELAY ? L[i - DELAY] : 0) * gain * 0.94;
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), i * 4 + 2);
}

/* WAV header (PCM 16-bit stereo) */
const h = Buffer.alloc(44);
h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
writeFileSync("carillon.wav", Buffer.concat([h, pcm]));
console.log("carillon.wav scritto:", (pcm.length / 1024 / 1024).toFixed(1), "MB");
