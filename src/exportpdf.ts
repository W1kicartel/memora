/**
 * exportpdf.ts — download AI-generated study material as a clean PDF.
 *
 * Strategy: open a self-contained print window with a light, paper-optimised
 * stylesheet and trigger the browser's native "Save as PDF". This keeps text
 * vector-crisp (no rasterisation), reproduces tables and the schematic concept
 * map faithfully, and works both in the Electron app and a plain browser — with
 * zero heavy PDF dependencies.
 *
 * Two content paths:
 *   • exportNode()  — reuses already-rendered HTML (markdown notes, concept map)
 *   • cardsToHtml() / examToHtml() — build printable HTML from structured data
 */

import type { ParsedCard } from "./import";
import type { ExamQuestion } from "./claude";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Light, print-only stylesheet — mirrors the on-screen structure on white paper. */
const PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Google Sans", "Roboto", "Segoe UI", system-ui, sans-serif;
    color: #1f2430; background: #fff; font-size: 12px; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc { max-width: 760px; margin: 0 auto; padding: 28px 30px 40px; }
  .doc-head {
    display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 2px solid #5f6bd2; padding-bottom: 10px; margin-bottom: 20px;
  }
  .doc-head h1 { font-size: 19px; margin: 0; color: #12172a; font-weight: 700; }
  .doc-brand { font-size: 12px; font-weight: 700; color: #5f6bd2; letter-spacing: .04em; }
  h2, .md-h2 { font-size: 15px; color: #12172a; margin: 18px 0 6px; }
  h3, .md-h3, .md-h4 { font-size: 13px; color: #3b429c; margin: 12px 0 5px; }
  .md-h1 { font-size: 16px; }
  p, .md-p { margin: 0 0 8px; }
  ul, ol { margin: 4px 0 10px; padding-left: 20px; }
  li { margin-bottom: 3px; }
  strong { color: #12172a; }
  code, .md-code {
    font-family: "Roboto Mono", ui-monospace, monospace;
    background: #f2f3f8; border-radius: 4px;
  }
  code { padding: 1px 4px; font-size: .9em; }
  .md-code { display: block; padding: 8px 10px; margin: 8px 0; white-space: pre-wrap; border: 1px solid #e2e4ef; }
  .md-table-wrap { overflow: visible; margin: 8px 0 12px; }
  table, .md-table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #d6d9e6; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eef0fb; font-weight: 700; }
  blockquote, .md-box {
    border-left: 3px solid #5f6bd2; background: #f5f6fd;
    padding: 7px 11px; margin: 9px 0; border-radius: 0 5px 5px 0;
  }
  .md-box p { margin: 0 0 4px; }

  /* Concept map — light rendering, keyed off the inline --chunk-hue */
  .cmap { border: 1px solid #e2e4ef; border-radius: 12px; padding: 14px; margin: 12px 0 16px; page-break-inside: avoid; }
  .cmap-title {
    width: fit-content; margin: 0 auto; padding: 6px 16px; text-align: center;
    font-weight: 800; color: #fff; background: #5f6bd2; border-radius: 999px;
  }
  .cmap-stem { width: 2px; height: 12px; margin: 0 auto; background: #5f6bd2; }
  .cmap-chunks { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 9px; }
  .cmap-chunk {
    background: hsla(var(--chunk-hue,232), 70%, 55%, 0.08);
    border: 1px solid hsla(var(--chunk-hue,232), 60%, 45%, 0.4);
    border-top: 3px solid hsla(var(--chunk-hue,232), 60%, 45%, 0.85);
    border-radius: 8px; padding: 9px; page-break-inside: avoid;
  }
  .cmap-chunk-head { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 7px; }
  .cmap-chunk-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: hsla(var(--chunk-hue,232), 55%, 38%, 1); }
  .cmap-acronym { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: hsla(var(--chunk-hue,232), 60%, 50%, 0.16); color: hsla(var(--chunk-hue,232), 55%, 35%, 1); }
  .cmap-concepts { list-style: none; margin: 0; padding: 0; }
  .cmap-concept { padding: 5px 7px; margin-bottom: 5px; background: #fff; border: 1px solid #e6e8f2; border-radius: 5px; }
  .cmap-concept-name { display: block; font-weight: 600; color: #1f2430; }
  .cmap-mnemo { display: block; margin-top: 2px; font-size: 10.5px; font-style: italic; color: #5a6072; }
  .cmap-links { list-style: none; margin: 10px 0 0; padding: 8px 0 0; border-top: 1px dashed #d6d9e6; }
  .cmap-link { font-size: 11px; margin-bottom: 4px; }
  .cmap-link-arrow { color: #5f6bd2; font-style: italic; margin: 0 5px; }

  /* Flashcards */
  .pf-card { border: 1px solid #dfe2ee; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .pf-front { font-weight: 700; color: #12172a; margin-bottom: 5px; }
  .pf-back { color: #33384a; white-space: pre-wrap; }

  /* Exam */
  .pe-q { margin-bottom: 14px; page-break-inside: avoid; }
  .pe-stem { font-weight: 700; color: #12172a; margin-bottom: 5px; }
  .pe-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; background: #eef0fb; color: #3b429c; margin-right: 6px; }
  .pe-opt { padding: 3px 0 3px 4px; }
  .pe-opt.correct { color: #167a3c; font-weight: 700; }
  .pe-why { font-size: 10.5px; color: #5a6072; font-style: italic; margin: 2px 0 0 16px; }

  @page { margin: 14mm; }
  @media print { .doc { padding: 0; } }
`;

/** Open a print window with the given body HTML and trigger Save-as-PDF. */
export function printHtml(title: string, bodyHtml: string): void {
  const w = window.open("", "_blank", "width=840,height=1000");
  if (!w) {
    window.alert("Impossibile aprire la finestra di stampa. Consenti i popup per esportare in PDF.");
    return;
  }
  w.document.open();
  w.document.write(
    `<!doctype html><html lang="it"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>` +
    `<div class="doc"><div class="doc-head"><h1>${esc(title)}</h1>` +
    `<span class="doc-brand">Memora</span></div>${bodyHtml}</div></body></html>`,
  );
  w.document.close();

  const go = () => { try { w.focus(); w.print(); } catch { /* window closed */ } };
  // Give fonts/layout a moment so the first page isn't blank.
  if (w.document.readyState === "complete") setTimeout(go, 300);
  else w.onload = () => setTimeout(go, 300);
}

/** Export an already-rendered element (markdown notes, concept map) as PDF. */
export function exportNode(title: string, node: HTMLElement | null): void {
  if (!node) return;
  printHtml(title, node.innerHTML);
}

/** Build printable HTML for a set of flashcards. */
export function cardsToHtml(cards: ParsedCard[]): string {
  return cards
    .map(
      (c) =>
        `<div class="pf-card"><div class="pf-front">${esc(c.front)}</div>` +
        `<div class="pf-back">${esc(c.back)}</div></div>`,
    )
    .join("");
}

/** Build printable HTML for a mock exam, including the reasoned answer key. */
export function examToHtml(questions: ExamQuestion[]): string {
  return questions
    .map((q, i) => {
      const opts = q.options
        .map(
          (o, oi) =>
            `<div class="pe-opt${o.correct ? " correct" : ""}">` +
            `${String.fromCharCode(65 + oi)}) ${esc(o.text)}${o.correct ? " ✓" : ""}` +
            (o.why ? `<div class="pe-why">${esc(o.why)}</div>` : "") +
            `</div>`,
        )
        .join("");
      return (
        `<div class="pe-q"><div class="pe-stem">` +
        `<span class="pe-badge">${esc(q.difficulty)}</span>${i + 1}. ${esc(q.question)}</div>` +
        opts +
        `</div>`
      );
    })
    .join("");
}
