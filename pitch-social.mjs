/**
 * pitch-social.mjs — the Memora Social pitch video: flat 2D motion design in
 * the rosa-confetto palette, rendered SVG → PNG (sharp) frame by frame and
 * assembled with ffmpeg. Same pipeline as film-cartoon.mjs, different film:
 * this one sells the app to a friend, so no romantic content — study,
 * groups, chat, memes.
 *
 *   node pitch-social.mjs preview   → key frames into ./frames-pitch
 *   node pitch-social.mjs all       → every frame into ./frames-pitch
 */
import sharp from "sharp";
import { mkdirSync } from "fs";

const W = 1280, H = 720, FPS = 15, DUR = 34;
const FRAMES = DUR * FPS;

/* palette — the Bubblegum (rosa confetto) theme */
const PINK = "#fad2e1", PINKDEEP = "#f5b8cf", PAPER = "#fff6fa", INK = "#46203a";
const ACCENT = "#e04f8f", VIOLET = "#6a5acd", PINE = "#2b8a5c", OCHRE = "#b8862f";
const MUTED = "#8a5b76";

/* easing */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/* ── shared props ──────────────────────────────────────────────────────── */

function candyBg() {
  let rules = "";
  for (let y = 90; y < H; y += 46) rules += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${VIOLET}" stroke-opacity=".08" stroke-width="2"/>`;
  return `<rect width="${W}" height="${H}" fill="${PINK}"/>
    <rect width="${W}" height="${H}" fill="url(#pinkgrad)"/>
    ${rules}
    <line x1="86" y1="0" x2="86" y2="${H}" stroke="${ACCENT}" stroke-opacity=".25" stroke-width="3"/>`;
}

const DEFS = `<defs>
  <linearGradient id="pinkgrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${PINK}" stop-opacity="0"/>
    <stop offset="1" stop-color="${PINKDEEP}" stop-opacity=".55"/>
  </linearGradient>
</defs>`;

/** Cardino, the flashcard mascot — `color` lets friends join the cast. */
function mascot(x, y, s = 1, { sx = 1, sy = 1, rot = 0, blink = 0, mood = "happy", arms = 0, color = ACCENT } = {}) {
  const eyeH = lerp(7, 0.6, blink);
  const mouth = mood === "sing"
    ? `<ellipse cx="0" cy="26" rx="11" ry="14" fill="${INK}"/>`
    : `<path d="M -16 22 Q 0 38 16 22" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
  const armL = arms ? `<path d="M -72 -6 Q -100 ${-30 - arms * 26} -112 ${-44 - arms * 30}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>` : "";
  const armR = arms ? `<path d="M 72 -6 Q 100 ${-30 - arms * 26} 112 ${-44 - arms * 30}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>` : "";
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s * sx} ${s * sy})">
    <rect x="-74" y="-96" width="148" height="192" rx="16" fill="${PAPER}" stroke="${color}" stroke-width="5"/>
    <line x1="-74" y1="-58" x2="74" y2="-58" stroke="${color}" stroke-opacity=".5" stroke-width="3"/>
    <line x1="-56" y1="52" x2="56" y2="52" stroke="${VIOLET}" stroke-opacity=".25" stroke-width="3"/>
    <line x1="-56" y1="70" x2="34" y2="70" stroke="${VIOLET}" stroke-opacity=".25" stroke-width="3"/>
    <rect x="-28" y="-13.5" width="12" height="${eyeH * 2}" rx="6" transform="translate(0 ${7 - eyeH})" fill="${INK}"/>
    <rect x="16" y="-13.5" width="12" height="${eyeH * 2}" rx="6" transform="translate(0 ${7 - eyeH})" fill="${INK}"/>
    <circle cx="-42" cy="14" r="9" fill="${ACCENT}" opacity=".3"/>
    <circle cx="42" cy="14" r="9" fill="${ACCENT}" opacity=".3"/>
    ${mouth}${armL}${armR}
  </g>`;
}

function caption(text, o, y = 645) {
  if (o <= 0.01) return "";
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Georgia" font-style="italic"
    font-size="34" fill="${INK}" opacity="${o}">${text}</text>`;
}

const star = (x, y, s, o, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity="${clamp(o, 0, 1)}">
  <path d="M 0 -14 L 4 -4 L 14 -4 L 6 3 L 9 13 L 0 7 L -9 13 L -6 3 L -14 -4 L -4 -4 Z" fill="${OCHRE}"/></g>`;

/* deterministic confetti (no Math.random: frames must be reproducible) */
function confetti(u, n = 26, o = 1) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const seed = (i * 137.5) % 360;
    const x = 60 + ((i * 199) % (W - 120));
    const p = (u * 0.45 + (i % 7) * 0.13) % 1.3;
    if (p > 1) continue;
    const y = lerp(-30, H + 30, p);
    const col = [ACCENT, VIOLET, OCHRE, PINE][i % 4];
    out += `<rect x="${x}" y="${y}" width="12" height="8" rx="2" fill="${col}" opacity="${o * 0.85}"
      transform="rotate(${seed + u * 160} ${x} ${y})"/>`;
  }
  return out;
}

function logo(cx, cy, size, o = 1) {
  return `<g opacity="${o}">
    <text x="${cx}" y="${cy}" text-anchor="middle" font-family="Georgia" font-weight="bold"
      font-size="${size}" fill="${INK}">Me<tspan fill="${ACCENT}" font-style="italic">mo</tspan>ra</text>
    <text x="${cx}" y="${cy + size * 0.62}" text-anchor="middle" font-family="Georgia" font-weight="bold"
      font-size="${size * 0.52}" fill="${VIOLET}" letter-spacing="6">SOCIAL</text>
  </g>`;
}

/* ── scenes (local time u in seconds) ──────────────────────────────────── */

/* S1 0–6: title springs in, Cardino bounces up, confetti */
function s1(u) {
  const cx = W / 2;
  const title = ease((u - 0.6) / 0.9);
  const jump = ease((u - 1.6) / 0.9);
  const land = u > 2.5;
  const squash = land ? 1 + 0.12 * Math.exp(-(u - 2.5) * 4) * Math.cos((u - 2.5) * 18) : 1;
  const my = lerp(H + 140, 430, jump) - (jump > 0 && jump < 1 ? Math.sin(jump * Math.PI) * 90 : 0);
  const blink = (u % 3.2) > 3.05 ? 1 : 0;
  const bob = land ? Math.sin(u * 2.6) * 5 : 0;
  return `
    ${u > 1.1 ? confetti(u - 1.1, 26, clamp((u - 1.1) / 0.5, 0, 1) * clamp((5.4 - u) / 0.8, 0, 1)) : ""}
    ${title > 0 ? `<g transform="translate(${cx} 0) scale(${lerp(0.6, 1, easeOutBack(title))})">
      ${logo(0, 200, 96, title)}
    </g>` : ""}
    ${u > 1.6 ? mascot(cx, my + bob, 0.95, { sy: squash, sx: 2 - squash, blink, arms: land ? 0.8 : 1 }) : ""}
    ${caption("Studiare da soli? Che noia.", ease((u - 3.4) / 0.7) * (1 - ease((u - 5.4) / 0.5)))}`;
}

/* S2 6–12: flashcard flips, stars, level bar fills */
function s2(u) {
  const bob = Math.sin(u * 2.2) * 6;
  const blink = (u % 3.1) > 2.95 ? 1 : 0;
  const flip = ease((u - 2.2) / 0.55);
  const w = Math.abs(Math.cos(flip * Math.PI));
  const isA = flip > 0.5;
  const stars = ease((u - 3.0) / 0.6);
  const bar = ease((u - 3.4) / 1.6);
  return `
    ${mascot(300, 400 + bob, 0.9, { blink, arms: 0.5 })}
    <g transform="translate(640 370)">
      <g transform="scale(${Math.max(w, 0.02)} 1)">
        <rect x="-130" y="-160" width="260" height="320" rx="18" fill="${PAPER}" stroke="${isA ? PINE : ACCENT}" stroke-width="6"/>
        <line x1="-130" y1="-100" x2="130" y2="-100" stroke="${isA ? PINE : ACCENT}" stroke-opacity=".45" stroke-width="4"/>
        <text x="0" y="40" text-anchor="middle" font-family="Georgia" font-size="120" fill="${isA ? PINE : ACCENT}">${isA ? "!" : "?"}</text>
      </g>
    </g>
    ${stars > 0 ? star(850, 190, lerp(0.4, 1.4, stars), 1 - (u - 3.0) / 3, (u * 60) % 360) : ""}
    ${stars > 0 ? star(930, 290, lerp(0.3, 1.0, stars), 1 - (u - 3.2) / 3, (u * -45) % 360) : ""}
    ${stars > 0 ? star(780, 120, lerp(0.3, 0.9, stars), 1 - (u - 3.4) / 3, (u * 80) % 360) : ""}
    <g transform="translate(1020 380)">
      <rect x="-90" y="-16" width="180" height="32" rx="16" fill="${PAPER}" stroke="${MUTED}" stroke-opacity=".4" stroke-width="3"/>
      <rect x="-84" y="-10" width="${lerp(6, 168, bar)}" height="20" rx="10" fill="${ACCENT}"/>
      <text x="0" y="52" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="26" fill="${MUTED}" opacity="${bar}">livello su!</text>
    </g>
    ${caption("Flashcard che sanno quando farsi ripassare.", ease((u - 0.9) / 0.7) * (1 - ease((u - 5.4) / 0.5)))}`;
}

/* S3 12–18: a PDF page + sparkles → a fan of cards. Local AI badge. */
function s3(u) {
  const docIn = ease(u / 0.8);
  const zap = ease((u - 1.6) / 0.7);
  const fan = ease((u - 2.2) / 0.9);
  const badge = ease((u - 3.4) / 0.7);
  const cards = [-1, 0, 1].map((k, i) => {
    const t = ease((u - 2.2 - i * 0.18) / 0.8);
    if (t <= 0) return "";
    const x = lerp(640, 900 + k * 130, t);
    const y = lerp(360, 350 + Math.abs(k) * 26, t);
    const rot = lerp(0, k * 14, t);
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${lerp(0.4, 0.9, t)})">
      <rect x="-70" y="-90" width="140" height="180" rx="12" fill="${PAPER}" stroke="${ACCENT}" stroke-width="5"/>
      <line x1="-70" y1="-52" x2="70" y2="-52" stroke="${ACCENT}" stroke-opacity=".5" stroke-width="3"/>
      <text x="0" y="20" text-anchor="middle" font-family="Georgia" font-size="56" fill="${ACCENT}">?</text>
    </g>`;
  }).join("");
  let sparks = "";
  if (zap > 0 && u < 3.6) for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + u * 2.2;
    sparks += star(560 + Math.cos(a) * 90, 340 + Math.sin(a) * 74, 0.7, (1 - Math.abs(Math.sin(u * 3 + i))) * zap, a * 60);
  }
  return `
    <g transform="translate(${lerp(-260, 330, docIn)} 360) rotate(-4)">
      <rect x="-105" y="-140" width="210" height="280" rx="8" fill="${PAPER}" stroke="${MUTED}" stroke-opacity=".5" stroke-width="4"/>
      <rect x="-105" y="-140" width="210" height="52" rx="8" fill="${VIOLET}" opacity=".22"/>
      <text x="0" y="-104" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="30" fill="${VIOLET}">PDF</text>
      ${[0, 1, 2, 3, 4, 5].map((r) => `<line x1="-80" y1="${-52 + r * 30}" x2="${r % 3 === 2 ? 30 : 80}" y2="${-52 + r * 30}" stroke="${MUTED}" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>`).join("")}
    </g>
    ${sparks}
    ${cards}
    ${badge > 0 ? `<g transform="translate(${W / 2} 560)" opacity="${badge}">
      <rect x="-290" y="-27" width="580" height="54" rx="27" fill="${PAPER}" stroke="${PINE}" stroke-width="3"/>
      <text x="0" y="9" text-anchor="middle" font-family="Georgia" font-size="24" fill="${PINE}">IA locale ✓ · gratis ✓ · i tuoi file restano tuoi ✓</text>
    </g>` : ""}
    ${caption("Dalle dispense alle flashcard: ci pensa l'IA.", ease((u - 0.9) / 0.7) * (1 - ease((u - 5.4) / 0.5)), 645)}`;
}

/* S4 18–24: one link → three mascots hop in as a group */
function s4(u) {
  const linkIn = easeOutBack(ease(u / 0.9));
  const friends = [
    { x: 380, c: ACCENT, d: 1.0 },
    { x: 640, c: VIOLET, d: 1.5 },
    { x: 900, c: PINE, d: 2.0 },
  ];
  const cast = friends.map((f) => {
    const t = ease((u - f.d) / 0.8);
    if (t <= 0) return "";
    const y = lerp(H + 140, 440, t) - (t > 0 && t < 1 ? Math.sin(t * Math.PI) * 70 : 0);
    const bob = t >= 1 ? Math.sin(u * 2.4 + f.x) * 5 : 0;
    const blink = ((u + f.x) % 3) > 2.85 ? 1 : 0;
    return mascot(f.x, y + bob, 0.82, { blink, arms: t >= 1 ? 0.6 : 1, color: f.c });
  }).join("");
  return `
    <g transform="translate(${W / 2} ${lerp(-80, 150, linkIn)})">
      <rect x="-330" y="-30" width="660" height="60" rx="30" fill="${PAPER}" stroke="${ACCENT}" stroke-width="4"/>
      <text x="0" y="10" text-anchor="middle" font-family="Consolas, monospace" font-size="28" fill="${ACCENT}">memora://join/gruppo-studio ⧉</text>
    </g>
    ${cast}
    ${caption("Un link. Incollato. Siete un gruppo studio.", ease((u - 2.6) / 0.7) * (1 - ease((u - 5.4) / 0.5)))}`;
}

/* S5 24–29: chat bubbles + sticker + GIF + mini calendar with a dot */
function s5(u) {
  const b1 = easeOutBack(ease((u - 0.3) / 0.5));
  const b2 = easeOutBack(ease((u - 1.1) / 0.5));
  const b3 = easeOutBack(ease((u - 1.9) / 0.5));
  const cal = ease((u - 1.2) / 0.8);
  let grid = "";
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const day = r * 7 + c + 1;
    if (day > 28) continue;
    const hot = day === 20;
    grid += `<g transform="translate(${c * 44} ${r * 44})">
      <rect x="0" y="0" width="38" height="38" rx="8" fill="${hot ? ACCENT : PAPER}" stroke="${hot ? ACCENT : MUTED}" stroke-opacity="${hot ? 1 : 0.3}" stroke-width="2"/>
      <text x="19" y="25" text-anchor="middle" font-family="Georgia" font-size="17" fill="${hot ? "#fff" : MUTED}">${day}</text>
      ${hot ? `<circle cx="19" cy="43" r="0" fill="${ACCENT}"/>` : ""}
    </g>`;
  }
  return `
    <g transform="translate(210 150)">
      ${b1 > 0 ? `<g transform="scale(${b1})">
        <rect x="0" y="0" width="330" height="64" rx="20" fill="${PAPER}" stroke="${MUTED}" stroke-opacity=".35" stroke-width="3"/>
        <text x="24" y="40" font-family="Georgia" font-size="26" fill="${INK}">Chi c'è sabato? 📚</text>
      </g>` : ""}
      ${b2 > 0 ? `<g transform="translate(120 92) scale(${b2})">
        <rect x="0" y="0" width="240" height="64" rx="20" fill="${ACCENT}" opacity=".14"/>
        <rect x="0" y="0" width="240" height="64" rx="20" fill="none" stroke="${ACCENT}" stroke-opacity=".55" stroke-width="3"/>
        <text x="24" y="40" font-family="Georgia" font-size="26" fill="${INK}">Io! Porto i memes</text>
      </g>` : ""}
      ${b3 > 0 ? `<g transform="translate(40 184) scale(${b3})">
        <rect x="0" y="0" width="150" height="110" rx="14" fill="${PINKDEEP}" stroke="${ACCENT}" stroke-width="3"/>
        <text x="75" y="52" text-anchor="middle" font-size="44">😹</text>
        <text x="75" y="94" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="20" fill="${ACCENT}">GIF</text>
      </g>` : ""}
    </g>
    ${cal > 0 ? `<g transform="translate(760 160)" opacity="${cal}">
      <rect x="-24" y="-58" width="350" height="290" rx="16" fill="${PAPER}" stroke="${MUTED}" stroke-opacity=".35" stroke-width="3"/>
      <text x="150" y="-20" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="24" fill="${INK}">eventi del gruppo</text>
      <g transform="translate(0 6)">${grid}</g>
      <text x="150" y="264" text-anchor="middle" font-family="Georgia" font-style="italic" font-size="20" fill="${MUTED}">→ finisce sul tuo Google Calendar</text>
    </g>` : ""}
    ${caption("Chat, GIF, sticker — e gli eventi in calendario.", ease((u - 2.6) / 0.7) * (1 - ease((u - 4.4) / 0.5)))}`;
}

/* S6 29–34: closing card */
function s6(u) {
  const inA = ease(u / 0.8);
  const sub = ease((u - 1.2) / 0.8);
  const cta = easeOutBack(ease((u - 2.2) / 0.7));
  return `
    ${confetti(u + 3, 20, 0.5 * inA)}
    <g transform="translate(0 ${lerp(30, 0, inA)})" opacity="${inA}">
      ${logo(W / 2, 300, 92)}
    </g>
    ${sub > 0 ? `<text x="${W / 2}" y="440" text-anchor="middle" font-family="Georgia" font-style="italic"
      font-size="32" fill="${MUTED}" opacity="${sub}">Gratis, senza account, fatta per chi studia.</text>` : ""}
    ${cta > 0 ? `<g transform="translate(${W / 2} 530) scale(${cta})">
      <rect x="-220" y="-34" width="440" height="68" rx="34" fill="${ACCENT}"/>
      <text x="0" y="11" text-anchor="middle" font-family="Georgia" font-weight="bold" font-size="30" fill="#fff">Ti aspettiamo nel gruppo ✨</text>
    </g>` : ""}`;
}

/* ── timeline ──────────────────────────────────────────────────────────── */

const SCENES = [
  { start: 0,  end: 6,  fn: s1 },
  { start: 6,  end: 12, fn: s2 },
  { start: 12, end: 18, fn: s3 },
  { start: 18, end: 24, fn: s4 },
  { start: 24, end: 29, fn: s5 },
  { start: 29, end: 34, fn: s6 },
];
const XFADE = 0.45;

function frameSvg(t) {
  const scene = SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES[SCENES.length - 1];
  const u = t - scene.start;
  const toEnd = scene.end - t, fromStart = t - scene.start;
  let veil = 0;
  if (toEnd < XFADE && scene !== SCENES[SCENES.length - 1]) veil = 1 - toEnd / XFADE;
  if (fromStart < XFADE && scene !== SCENES[0]) veil = Math.max(veil, 1 - fromStart / XFADE);
  let black = 0;
  if (t < 0.6) black = 1 - t / 0.6;
  if (t > DUR - 1.0) black = (t - (DUR - 1.0)) / 1.0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${DEFS}
    ${candyBg()}
    ${scene.fn(u)}
    ${veil > 0 ? `<rect width="${W}" height="${H}" fill="${PINK}" opacity="${veil}"/>` : ""}
    ${black > 0 ? `<rect width="${W}" height="${H}" fill="#2a1220" opacity="${black}"/>` : ""}
  </svg>`;
}

/* ── renderer ──────────────────────────────────────────────────────────── */

async function renderFrame(i, path) {
  await sharp(Buffer.from(frameSvg(i / FPS))).png().toFile(path);
}

const mode = process.argv[2] ?? "preview";
mkdirSync("frames-pitch", { recursive: true });

if (mode === "preview") {
  const keys = [2.0, 4.5, 9.0, 15.5, 16.5, 21.5, 27.0, 32.5];
  for (const t of keys) {
    await sharp(Buffer.from(frameSvg(t))).png().toFile(`frames-pitch/preview-${t.toFixed(1).replace(".", "_")}.png`);
  }
  console.log("preview done");
} else {
  const POOL = 10;
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    for (;;) {
      const i = next++;
      if (i >= FRAMES) return;
      await renderFrame(i, `frames-pitch/f${String(i).padStart(4, "0")}.png`);
      if (++done % 100 === 0) console.log(`${done}/${FRAMES}`);
    }
  }));
  console.log(`rendered ${FRAMES} frames`);
}
