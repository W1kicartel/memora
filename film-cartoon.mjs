/**
 * film-cartoon.mjs — a hand-drawn-style vector cartoon, rendered frame by
 * frame as SVG → PNG (sharp) and assembled with ffmpeg. No screenshots, no
 * grain: flat, crisp 2D animation in the app's palette.
 *
 *   node film-cartoon.mjs preview   → renders a handful of key frames
 *   node film-cartoon.mjs all       → renders every frame into ./frames
 */
import sharp from "sharp";
import { mkdirSync } from "fs";

const W = 1280, H = 720, FPS = 15, DUR = 39;
const FRAMES = DUR * FPS;

/* palette (the app's) */
const CREAM = "#f3ede1", PAPER = "#fffdf8", INK = "#241f18";
const CLARET = "#9e2b25", CORAL = "#d9584c", OCHRE = "#b8862f", PINE = "#2c6e52";
const MUTED = "#6e6456", BLUE = "#3e5c8a";

/* easing */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const bounceY = (t) => Math.abs(Math.sin(t * Math.PI)) ;

/* ── shared props ──────────────────────────────────────────────────────── */

function paperBg() {
  let rules = "";
  for (let y = 90; y < H; y += 46) rules += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${BLUE}" stroke-opacity=".08" stroke-width="2"/>`;
  return `<rect width="${W}" height="${H}" fill="${CREAM}"/>
    ${rules}
    <line x1="86" y1="0" x2="86" y2="${H}" stroke="${CLARET}" stroke-opacity=".22" stroke-width="3"/>`;
}

/** Cardino — the flashcard mascot. blink 0..1, mood: happy|sing|worried */
function mascot(x, y, s = 1, { sx = 1, sy = 1, rot = 0, blink = 0, mood = "happy", arms = 0 } = {}) {
  const eyeH = lerp(7, 0.6, blink);
  const mouth = mood === "sing"
    ? `<ellipse cx="0" cy="26" rx="11" ry="14" fill="${INK}"/>`
    : mood === "worried"
      ? `<path d="M -14 32 Q 0 22 14 32" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`
      : `<path d="M -16 22 Q 0 38 16 22" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  const armL = arms ? `<path d="M -72 -6 Q -100 ${-30 - arms * 26} -112 ${-44 - arms * 30}" fill="none" stroke="${CLARET}" stroke-width="6" stroke-linecap="round"/>` : "";
  const armR = arms ? `<path d="M 72 -6 Q 100 ${-30 - arms * 26} 112 ${-44 - arms * 30}" fill="none" stroke="${CLARET}" stroke-width="6" stroke-linecap="round"/>` : "";
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s * sx} ${s * sy})">
    <rect x="-74" y="-96" width="148" height="192" rx="16" fill="${PAPER}" stroke="${CLARET}" stroke-width="5"/>
    <line x1="-74" y1="-58" x2="74" y2="-58" stroke="${CLARET}" stroke-opacity=".5" stroke-width="3"/>
    <line x1="-56" y1="52" x2="56" y2="52" stroke="${BLUE}" stroke-opacity=".25" stroke-width="3"/>
    <line x1="-56" y1="70" x2="34" y2="70" stroke="${BLUE}" stroke-opacity=".25" stroke-width="3"/>
    <rect x="-28" y="-13.5" width="12" height="${eyeH * 2}" rx="6" transform="translate(0 ${7 - eyeH})" fill="${INK}"/>
    <rect x="16" y="-13.5" width="12" height="${eyeH * 2}" rx="6" transform="translate(0 ${7 - eyeH})" fill="${INK}"/>
    <circle cx="-42" cy="14" r="9" fill="${CORAL}" opacity=".35"/>
    <circle cx="42" cy="14" r="9" fill="${CORAL}" opacity=".35"/>
    ${mouth}${armL}${armR}
  </g>`;
}

function heartBuddy(x, y, s = 1, { rot = 0, blink = 0, sad = 0 } = {}) {
  const eyeH = lerp(6, 0.6, blink);
  const mouth = sad > 0.5
    ? `<path d="M -10 26 Q 0 18 10 26" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`
    : `<path d="M -11 20 Q 0 31 11 20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M 0 34 C -46 4 -52 -34 -26 -44 C -8 -50 0 -36 0 -28 C 0 -36 8 -50 26 -44 C 52 -34 46 4 0 34 Z"
      fill="${CORAL}" stroke="${CLARET}" stroke-width="4"/>
    <rect x="-19" y="-16" width="9" height="${eyeH * 2}" rx="4.5" transform="translate(0 ${6 - eyeH})" fill="#fff"/>
    <rect x="10" y="-16" width="9" height="${eyeH * 2}" rx="4.5" transform="translate(0 ${6 - eyeH})" fill="#fff"/>
    ${mouth}
  </g>`;
}

const note = (x, y, s, rot, o = 1) =>
  `<text x="${x}" y="${y}" font-family="Georgia" font-size="${44 * s}" fill="${CLARET}" opacity="${o}" transform="rotate(${rot} ${x} ${y})">♪</text>`;

function caption(text, o, y = 640) {
  if (o <= 0.01) return "";
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Georgia" font-style="italic"
    font-size="34" fill="${INK}" opacity="${o}">${text}</text>`;
}

const star = (x, y, s, o, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity="${o}">
  <path d="M 0 -14 L 4 -4 L 14 -4 L 6 3 L 9 13 L 0 7 L -9 13 L -6 3 L -14 -4 L -4 -4 Z" fill="${OCHRE}"/></g>`;

/* ── scenes (local time u in seconds) ──────────────────────────────────── */

/* S1 0–7.5: the gift opens, Cardino pops out, title */
function s1(u) {
  const cx = W / 2, gy = 470;
  const lidPop = ease((u - 2.2) / 0.7);
  const jump = ease((u - 2.6) / 1.0);
  const land = u > 3.6;
  const squash = land ? 1 + 0.12 * Math.exp(-(u - 3.6) * 4) * Math.cos((u - 3.6) * 18) : 1;
  const my = lerp(gy - 20, 285 + (land ? 0 : 0), jump) - (jump > 0 && jump < 1 ? Math.sin(jump * Math.PI) * 130 : 0);
  const blink = (u % 3.4) > 3.25 ? 1 : 0;
  const title = ease((u - 4.6) / 0.9);
  const bob = Math.sin(u * 2.4) * 5;
  return `
    ${u > 2.6 ? mascot(cx, my + (land ? bob : 0), 1, { sy: squash, sx: 2 - squash, blink, arms: land ? 0.7 : 1 }) : ""}
    <g transform="translate(${cx} ${gy})">
      <rect x="-120" y="-90" width="240" height="150" rx="14" fill="${CLARET}"/>
      <rect x="-120" y="-90" width="240" height="150" rx="14" fill="#fff" opacity=".07"/>
      <rect x="-16" y="-90" width="32" height="150" fill="${OCHRE}"/>
      <g transform="translate(${lerp(0, 240, lidPop)} ${lerp(0, -190, lidPop)}) rotate(${lerp(0, 38, lidPop)})">
        <rect x="-136" y="-124" width="272" height="40" rx="10" fill="${CLARET}" stroke="#7e201b" stroke-width="0"/>
        <rect x="-20" y="-124" width="40" height="40" fill="${OCHRE}"/>
        <path d="M 0 -124 C -14 -152 -46 -150 -44 -132 C -43 -122 -20 -118 0 -124 C 20 -118 43 -122 44 -132 C 46 -150 14 -152 0 -124 Z" fill="${OCHRE}"/>
      </g>
    </g>
    ${title > 0 ? `<text x="${cx}" y="150" text-anchor="middle" font-family="Georgia" font-weight="bold"
      font-size="${lerp(60, 84, easeOutBack(title))}" fill="${INK}" opacity="${title}">Me<tspan fill="${CLARET}" font-style="italic">mo</tspan>ra</text>` : ""}
    ${caption("C'è un regalo che si apre ogni giorno.", ease((u - 5.4) / 0.8))}`;
}

/* S2 7.5–15: study — question card flips, stars, flame grows */
function s2(u) {
  const cx = 430;
  const bob = Math.sin(u * 2.2) * 6;
  const blink = (u % 3.1) > 2.95 ? 1 : 0;
  const flip = ease((u - 3.2) / 0.55);
  const w = Math.abs(Math.cos(flip * Math.PI)) ;
  const isA = flip > 0.5;
  const stars = ease((u - 4.0) / 0.6);
  const flame = ease((u - 4.6) / 1.6);
  const cardFace = isA
    ? `<text x="0" y="30" text-anchor="middle" font-family="Georgia" font-size="120" fill="${PINE}">!</text>`
    : `<text x="0" y="30" text-anchor="middle" font-family="Georgia" font-size="120" fill="${CLARET}">?</text>`;
  return `
    ${mascot(cx - 230, 400 + bob, 0.9, { blink, arms: 0.5 })}
    <g transform="translate(${cx + 160} 380) scale(${0.4 + 0.6 * 1} 1)">
      <g transform="scale(${Math.max(w, 0.02)} 1)">
        <rect x="-130" y="-160" width="260" height="320" rx="18" fill="${PAPER}" stroke="${isA ? PINE : CLARET}" stroke-width="6"/>
        <line x1="-130" y1="-100" x2="130" y2="-100" stroke="${isA ? PINE : CLARET}" stroke-opacity=".45" stroke-width="4"/>
        ${cardFace}
      </g>
    </g>
    ${stars > 0 ? star(720, 210, lerp(0.4, 1.4, stars), 1 - (u - 4.0) / 3, (u * 60) % 360) : ""}
    ${stars > 0 ? star(790, 300, lerp(0.3, 1.0, stars), 1 - (u - 4.2) / 3, (u * -45) % 360) : ""}
    ${stars > 0 ? star(660, 130, lerp(0.3, 0.9, stars), 1 - (u - 4.4) / 3, (u * 80) % 360) : ""}
    <g transform="translate(1000 420)">
      <rect x="-70" y="26" width="140" height="14" rx="7" fill="${INK}" opacity=".12"/>
      <path transform="scale(${lerp(0.5, 1.35, flame)})" d="M 0 20 C -42 6 -36 -46 -12 -68 C -10 -46 4 -44 2 -70 C 26 -52 40 -6 0 20 Z"
        fill="${CORAL}" stroke="${CLARET}" stroke-width="4"/>
      <path transform="scale(${lerp(0.5, 1.35, flame)})" d="M 0 12 C -16 4 -14 -18 -3 -30 C -2 -18 6 -18 5 -30 C 14 -20 16 -4 0 12 Z" fill="${OCHRE}"/>
      <text x="0" y="72" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="26" fill="${MUTED}" opacity="${flame}">livello su!</text>
    </g>
    ${caption("Studiare, un pezzetto di gioco alla volta.", ease((u - 1.2) / 0.7) * (1 - ease((u - 6.8) / 0.6)))}`;
}

/* S3 15–22: music — headphones, floating notes, a swinging love note */
function s3(u) {
  const bob = Math.sin(u * 2.6) * 7;
  const blink = (u % 2.9) > 2.75 ? 1 : 0;
  let notes = "";
  for (let i = 0; i < 5; i++) {
    const p = (u * 0.55 + i * 0.23) % 1.15;
    if (p < 1) notes += note(700 + i * 78 + Math.sin((u + i) * 2.2) * 16, lerp(430, 130, p), lerp(0.7, 1.25, p), Math.sin((u + i) * 3) * 16, 1 - p * 0.85);
  }
  const swing = Math.sin(u * 1.6) * 7;
  return `
    <g transform="translate(430 ${400 + bob})">
      ${mascot(0, 0, 1, { blink, mood: "sing" })}
      <path d="M -86 -40 C -86 -120 86 -120 86 -40" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
      <rect x="-104" y="-52" width="26" height="52" rx="12" fill="${INK}"/>
      <rect x="78" y="-52" width="26" height="52" rx="12" fill="${INK}"/>
    </g>
    <g transform="translate(950 250) rotate(${swing})">
      <rect x="-4" y="-160" width="8" height="120" fill="${MUTED}" opacity=".35"/>
      <g transform="translate(0 0) rotate(${-swing * 0.5})">
        <rect x="-110" y="-46" width="220" height="120" rx="6" fill="${PAPER}" stroke="${MUTED}" stroke-opacity=".4" stroke-width="3" transform="rotate(-3)"/>
        <rect x="-40" y="-56" width="80" height="20" fill="${CORAL}" opacity=".35" transform="rotate(-3)"/>
        <text x="0" y="6" text-anchor="middle" font-family="Segoe Print, Comic Sans MS, cursive" font-size="30" fill="${CLARET}" transform="rotate(-3)">una canzone</text>
        <text x="0" y="46" text-anchor="middle" font-family="Segoe Print, Comic Sans MS, cursive" font-size="30" fill="${CLARET}" transform="rotate(-3)">al giorno ♥</text>
      </g>
    </g>
    ${notes}
    ${caption("Ogni giorno, una canzone pensata per te.", ease((u - 1.0) / 0.7) * (1 - ease((u - 6.3) / 0.6)))}`;
}

/* S4 22–29: rainy day — buddy is sad, Cardino brings the umbrella */
function s4(u) {
  const cloudX = lerp(-260, 330, ease(u / 1.4));
  const rainOn = u > 1.2 && u < 5.2;
  const hero = ease((u - 2.6) / 1.1);
  const heroX = lerp(-180, 560, hero);
  const cloudOff = ease((u - 5.0) / 1.4);
  const sun = ease((u - 5.6) / 1.0);
  const sad = clamp(1 - (u - 4.6) / 0.8, 0, 1);
  let rain = "";
  if (rainOn) for (let i = 0; i < 14; i++) {
    const p = ((u * 2.2) + i * 0.37) % 1;
    rain += `<line x1="${240 + i * 14 + ((i * 37) % 60)}" y1="${lerp(300, 470, p)}" x2="${236 + i * 14 + ((i * 37) % 60)}" y2="${lerp(322, 492, p)}"
      stroke="${BLUE}" stroke-width="4" stroke-linecap="round" opacity="${0.5 * (1 - cloudOff)}"/>`;
  }
  const buddyBlink = (u % 2.8) > 2.65 ? 1 : 0;
  const hop = sun > 0 ? Math.abs(Math.sin(u * 5)) * 14 * sun : 0;
  return `
    ${sun > 0 ? `<g transform="translate(1060 150) scale(${lerp(0.6, 1, sun)})" opacity="${sun}">
      <circle r="52" fill="${OCHRE}"/>
      ${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="-70" x2="0" y2="-92" stroke="${OCHRE}" stroke-width="8" stroke-linecap="round" transform="rotate(${i * 45 + u * 12})"/>`).join("")}
    </g>` : ""}
    <g transform="translate(${cloudX + cloudOff * -600} 220)">
      <ellipse cx="0" cy="0" rx="120" ry="56" fill="${MUTED}" opacity=".55"/>
      <ellipse cx="-70" cy="16" rx="70" ry="40" fill="${MUTED}" opacity=".5"/>
      <ellipse cx="76" cy="14" rx="76" ry="42" fill="${MUTED}" opacity=".5"/>
    </g>
    ${rain}
    ${heartBuddy(330, 430 - hop, 1.15, { blink: buddyBlink, sad, rot: Math.sin(u * 2) * 3 * (1 - sad) })}
    ${hero > 0 ? mascot(heroX, 408 + Math.sin(u * 2.4) * 5, 0.88, { blink: buddyBlink }) : ""}
    ${hero > 0.55 ? (() => {
      const o = ease((u - 3.4) / 0.5);
      const ux = 330, uy = 288;
      const handX = heroX - 46, handY = 402;
      return `<g opacity="${o}">
        <line x1="${ux}" y1="${uy}" x2="${handX}" y2="${handY}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <g transform="translate(${ux} ${uy}) rotate(-12)">
          <path d="M -112 0 A 112 112 0 0 1 112 0 A 19 13 0 0 1 74 0 A 19 13 0 0 1 37 0 A 19 13 0 0 1 0 0 A 19 13 0 0 1 -37 0 A 19 13 0 0 1 -74 0 A 19 13 0 0 1 -112 0 Z" fill="${CLARET}"/>
          <circle cx="0" cy="-114" r="8" fill="${OCHRE}"/>
        </g>
      </g>`;
    })() : ""}
    ${caption("E nei giorni storti, qualcuno che resta.", ease((u - 3.2) / 0.8) * (1 - ease((u - 6.4) / 0.6)))}`;
}

/* S5 29–33.5: the voucher — time together */
function s5(u) {
  const drop = easeOutBack(ease(u / 1.1));
  const walk = ease((u - 2.2) / 2.0);
  const wx = lerp(420, 900, walk);
  const hopA = Math.abs(Math.sin(u * 6)) * 10 * (walk > 0 && walk < 1 ? 1 : 0);
  return `
    <g transform="translate(${W / 2} ${lerp(-160, 210, drop)}) rotate(${lerp(-14, -3, drop)})">
      <rect x="-230" y="-74" width="460" height="148" rx="8" fill="${PAPER}" stroke="${CLARET}" stroke-width="4" stroke-dasharray="10 8"/>
      <circle cx="-230" cy="0" r="16" fill="${CREAM}" stroke="${CLARET}" stroke-width="3" stroke-dasharray="6 5"/>
      <circle cx="230" cy="0" r="16" fill="${CREAM}" stroke="${CLARET}" stroke-width="3" stroke-dasharray="6 5"/>
      <text x="0" y="-18" text-anchor="middle" font-family="Georgia" font-size="26" fill="${OCHRE}" letter-spacing="4">BUONO</text>
      <text x="0" y="30" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="40" fill="${INK}">Cena per due <tspan fill="${CLARET}">♥</tspan></text>
    </g>
    ${mascot(wx - 90, 470 - hopA, 0.8, { rot: Math.sin(u * 6) * 4 * (walk < 1 ? 1 : 0) })}
    ${heartBuddy(wx + 60, 478 - Math.abs(Math.sin(u * 6 + 0.6)) * 10, 1, { rot: Math.sin(u * 6 + 1) * 5 })}
    ${caption("Ogni ora di studio diventa tempo insieme.", ease((u - 0.8) / 0.7) * (1 - ease((u - 3.9) / 0.5)))}`;
}

/* S6 33.5–39: the note + closing */
function s6(u) {
  const inA = ease(u / 0.9);
  const seal = easeOutBack(ease((u - 1.4) / 0.6));
  const closing = ease((u - 3.0) / 0.9);
  return `
    <g transform="translate(${W / 2} ${lerp(340, 290, inA)}) rotate(-2.5)" opacity="${inA}">
      <rect x="-330" y="-110" width="660" height="220" rx="6" fill="${PAPER}" stroke="${MUTED}" stroke-opacity=".35" stroke-width="3"/>
      <rect x="-70" y="-126" width="140" height="30" fill="${CORAL}" opacity=".3"/>
      <text x="0" y="-14" text-anchor="middle" font-family="Segoe Print, Comic Sans MS, cursive" font-size="40" fill="${CLARET}">You are allowed to</text>
      <text x="0" y="46" text-anchor="middle" font-family="Segoe Print, Comic Sans MS, cursive" font-size="40" fill="${CLARET}">want more btw.</text>
      ${seal > 0 ? `<g transform="translate(300 88) rotate(-10) scale(${seal})">
        <circle r="38" fill="${CLARET}"/><circle r="38" fill="#fff" opacity=".08"/>
        <circle r="28" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>
        <text x="0" y="12" text-anchor="middle" font-size="30" fill="#fff8f0">♥</text>
      </g>` : ""}
    </g>
    ${closing > 0 ? `<g opacity="${closing}">
      <text x="${W / 2}" y="530" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="52" fill="${INK}">Me<tspan fill="${CLARET}" font-style="italic">mo</tspan>ra</text>
      <text x="${W / 2}" y="588" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="30" fill="${MUTED}">fatto con amore, per te, <tspan fill="${CLARET}">Martina ♥</tspan></text>
    </g>` : ""}`;
}

/* ── timeline ──────────────────────────────────────────────────────────── */

const SCENES = [
  { start: 0,    end: 7.5,  fn: s1 },
  { start: 7.5,  end: 15,   fn: s2 },
  { start: 15,   end: 22,   fn: s3 },
  { start: 22,   end: 29,   fn: s4 },
  { start: 29,   end: 33.5, fn: s5 },
  { start: 33.5, end: 39,   fn: s6 },
];
const XFADE = 0.45;

function frameSvg(t) {
  const scene = SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES[SCENES.length - 1];
  const u = t - scene.start;
  // cream flash between scenes
  const toEnd = scene.end - t, fromStart = t - scene.start;
  let veil = 0;
  if (toEnd < XFADE && scene !== SCENES[SCENES.length - 1]) veil = 1 - toEnd / XFADE;
  if (fromStart < XFADE && scene !== SCENES[0]) veil = Math.max(veil, 1 - fromStart / XFADE);
  // global fade in/out
  let black = 0;
  if (t < 0.7) black = 1 - t / 0.7;
  if (t > DUR - 1.0) black = (t - (DUR - 1.0)) / 1.0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${paperBg()}
    ${scene.fn(u)}
    ${veil > 0 ? `<rect width="${W}" height="${H}" fill="${CREAM}" opacity="${veil}"/>` : ""}
    ${black > 0 ? `<rect width="${W}" height="${H}" fill="#0f0b07" opacity="${black}"/>` : ""}
  </svg>`;
}

/* ── renderer ──────────────────────────────────────────────────────────── */

async function renderFrame(i, path) {
  await sharp(Buffer.from(frameSvg(i / FPS))).png().toFile(path);
}

const mode = process.argv[2] ?? "preview";
mkdirSync("frames", { recursive: true });

if (mode === "preview") {
  const keys = [3.2, 6.0, 11.2, 18.5, 25.8, 27.5, 31.0, 35.6, 37.5];
  for (const t of keys) {
    await sharp(Buffer.from(frameSvg(t))).png().toFile(`frames/preview-${t.toFixed(1).replace(".", "_")}.png`);
  }
  console.log("preview done");
} else {
  const POOL = 10;
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    for (;;) {
      const i = next++;
      if (i >= FRAMES) return;
      await renderFrame(i, `frames/f${String(i).padStart(4, "0")}.png`);
      if (++done % 100 === 0) console.log(`${done}/${FRAMES}`);
    }
  }));
  console.log(`rendered ${FRAMES} frames`);
}
