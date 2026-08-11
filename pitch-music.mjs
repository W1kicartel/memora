/**
 * pitch-music.mjs — an upbeat original pop-pluck tune for the Memora Social
 * pitch video. Same pure-synthesis approach as make-music.mjs (no samples,
 * no copyrighted material), but faster and brighter: it's a pitch, not a
 * lullaby.
 *
 *   node pitch-music.mjs   →  writes pitch-tune.wav (stereo, 44.1 kHz, 34 s)
 */
import { writeFileSync } from "fs";

const SR = 44100, DUR = 34;
const L = new Float64Array(SR * DUR);

function freq(name) {
  const m = name.match(/^([A-G])(#?)(\d)$/);
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

/* bright pluck — quicker decay than the carillon, poppier */
function pluck(t0, note, amp = 0.5, decay = 3.4) {
  const f = freq(note);
  const start = Math.round(t0 * SR);
  if (start >= L.length) return;
  const len = Math.min(Math.round(2.2 * SR), L.length - start);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * decay) * Math.min(1, t * 300);
    const v =
      Math.sin(2 * Math.PI * f * t) * 0.68 +
      Math.sin(4 * Math.PI * f * t) * 0.24 * Math.exp(-t * 5) +
      Math.sin(6 * Math.PI * f * t) * 0.09 * Math.exp(-t * 8);
    L[start + i] += amp * env * v;
  }
}

/* soft "boop" bass — rounds out the low end without drums */
function bass(t0, note, amp = 0.30) {
  const f = freq(note) / 2;
  const start = Math.round(t0 * SR);
  if (start >= L.length) return;
  const len = Math.min(Math.round(0.5 * SR), L.length - start);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 7) * Math.min(1, t * 400);
    L[start + i] += amp * env * Math.sin(2 * Math.PI * f * t);
  }
}

/* ── composition: 22 bars of 1.5 s (~160 bpm eighths), C · Am · F · G ──── */

const BAR = 1.5, STEP = BAR / 4;
const ARPS = {
  C:  ["C4", "E4", "G4", "E4"],
  Am: ["A3", "C4", "E4", "C4"],
  F:  ["F3", "A3", "C4", "A3"],
  G:  ["G3", "B3", "D4", "B3"],
};
const ROOTS = { C: "C3", Am: "A2", F: "F2", G: "G2" };
const PROG = ["C", "Am", "F", "G", "C", "Am", "F", "G", "F", "G", "C", "Am", "F", "G", "C", "C", "Am", "F", "G", "C", "F", "C"];

PROG.forEach((chord, bar) => {
  const t0 = bar * BAR;
  bass(t0, ROOTS[chord]);
  bass(t0 + BAR / 2, ROOTS[chord], 0.22);
  ARPS[chord].forEach((n, i) => pluck(t0 + i * STEP, n, i === 0 ? 0.30 : 0.22, 3.2));
});

/* hook melody — enters at bar 4, sits on top */
const MELODY = [
  [4, 0, "E5", .40], [4, 2, "G5", .36], [5, 0, "A5", .40], [5, 2, "E5", .34],
  [6, 0, "F5", .40], [6, 2, "A5", .36], [7, 0, "G5", .42], [7, 3, "D5", .32],
  [8, 0, "A5", .40], [8, 2, "F5", .34], [9, 0, "B5", .40], [9, 2, "G5", .36],
  [10, 0, "C6", .44], [10, 2, "G5", .36], [11, 0, "A5", .38], [11, 2, "E5", .32],
  [12, 0, "F5", .38], [12, 2, "C5", .32], [13, 0, "D5", .38], [13, 2, "G5", .36],
  [14, 0, "E5", .42], [14, 2, "C5", .34], [15, 0, "G5", .40], [15, 2, "E5", .34],
  [16, 0, "A5", .40], [16, 2, "C6", .40], [17, 0, "A5", .38], [17, 2, "F5", .34],
  [18, 0, "G5", .40], [18, 2, "B5", .38], [19, 0, "C6", .46],
  [20, 0, "A5", .38], [20, 2, "F5", .34], [21, 0, "C6", .48],
];
MELODY.forEach(([bar, step, n, a]) => pluck(bar * BAR + step * STEP, n, a, 2.6));

/* closing bloom */
["C4", "E4", "G4", "C5", "E5", "C6"].forEach((n, i) => pluck(21 * BAR + 0.4 + i * 0.07, n, 0.30, 1.2));

/* fade the tail so the video can end clean */
const FADE = 2.5 * SR;
for (let i = 0; i < FADE; i++) {
  L[L.length - 1 - i] *= i / FADE;
}

/* normalize + stereo width (Haas) */
let peak = 0;
for (const v of L) peak = Math.max(peak, Math.abs(v));
const gain = 0.6 / peak;
const DELAY = Math.round(0.010 * SR);
const pcm = Buffer.alloc(SR * DUR * 4);
for (let i = 0; i < SR * DUR; i++) {
  const l = L[i] * gain;
  const r = (i >= DELAY ? L[i - DELAY] : 0) * gain * 0.94;
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), i * 4 + 2);
}

const h = Buffer.alloc(44);
h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
writeFileSync("pitch-tune.wav", Buffer.concat([h, pcm]));
console.log("pitch-tune.wav scritto:", (pcm.length / 1024 / 1024).toFixed(1), "MB");
