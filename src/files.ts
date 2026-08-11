/**
 * files.ts — turn ANY uploaded file into something Claude's Messages API can read.
 *
 * The Anthropic Messages API natively accepts only three input kinds:
 *   • PDF          → a `document` content block
 *   • images       → an `image` content block (jpeg/png/gif/webp)
 *   • plain text   → a `text` content block
 *
 * It does NOT accept video, audio, or Office binaries (docx/xlsx/pptx) directly.
 * So this module normalises every file into one of the supported kinds:
 *   • PDF                         → pdf attachment (base64)
 *   • jpeg/png/gif/webp images    → image attachment (base64)
 *   • other decodable images      → re-encoded to PNG via <canvas>
 *   • docx / pptx / xlsx          → text extracted client-side (they are ZIP+XML)
 *   • txt / csv / md / code / json→ text
 *   • video / audio / unknown bin → "unsupported" with an honest reason
 *
 * Browser/Electron-renderer only (uses File, canvas, DOMParser via regex). Not
 * unit-tested for that reason, in line with claude.ts / ai.tsx.
 */

import JSZip from "jszip";
import type { Attachment } from "./claude";

/** A file we accepted but cannot send to Claude, with a human explanation. */
export interface UnsupportedAttachment {
  kind: "unsupported";
  name: string;
  reason: string;
}

export type ReadResult = Attachment | UnsupportedAttachment;

const API_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "rtf",
  "html", "htm", "tex", "log", "srt", "vtt",
  // code
  "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "cs", "go", "rb",
  "php", "swift", "kt", "r", "m", "sql", "sh", "css", "scss",
]);

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Base64-encode an ArrayBuffer in chunks (avoids call-stack limits on big files). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Decode the handful of XML entities that appear in Office XML text runs. */
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&"); // last, so we don't double-decode
}

/** Collect the text inside every <prefix:tag ...>…</tag> occurrence, in order. */
function matchRuns(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(decodeXml(m[1]));
  return out;
}

/* ─── Office extraction ───────────────────────────────────────────────────── */

async function extractDocx(zip: JSZip): Promise<string> {
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  const xml = await doc.async("string");
  // Split into paragraphs, then pull the text runs (<w:t>) inside each.
  return xml
    .split(/<\/w:p>/)
    .map((p) => matchRuns(p, "t").join(""))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

async function extractPptx(zip: JSZip): Promise<string> {
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/slide(\d+)\.xml/)![1]);
      return n(a) - n(b);
    });
  const parts: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(slides[i])!.async("string");
    const text = matchRuns(xml, "t").join(" ").trim();
    if (text) parts.push(`— Slide ${i + 1} —\n${text}`);
  }
  return parts.join("\n\n");
}

async function extractXlsx(zip: JSZip): Promise<string> {
  // Shared strings are referenced by index from cells with t="s".
  const shared: string[] = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const ss = await ssFile.async("string");
    // Each <si> is one shared string; it may hold several <t> runs.
    for (const si of ss.split(/<\/si>/)) shared.push(matchRuns(si, "t").join(""));
  }

  const sheets = Object.keys(zip.files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort();

  const out: string[] = [];
  for (let s = 0; s < sheets.length; s++) {
    const xml = await zip.file(sheets[s])!.async("string");
    const rows: string[] = [];
    for (const row of xml.split(/<\/row>/)) {
      if (!row.includes("<c ") && !row.includes("<c>")) continue;
      const cells: string[] = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let c: RegExpExecArray | null;
      while ((c = cellRe.exec(row)) !== null) {
        const attrs = c[1];
        const body = c[2];
        const vMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (/t="s"/.test(attrs) && vMatch) {
          cells.push(shared[Number(vMatch[1])] ?? "");
        } else if (/t="inlineStr"/.test(attrs)) {
          cells.push(matchRuns(body, "t").join(""));
        } else if (vMatch) {
          cells.push(decodeXml(vMatch[1]));
        } else {
          cells.push("");
        }
      }
      const line = cells.join("\t").trimEnd();
      if (line.trim()) rows.push(line);
    }
    if (rows.length) out.push(`— Foglio ${s + 1} —\n${rows.join("\n")}`);
  }
  return out.join("\n\n");
}

/** Re-encode a browser-decodable image (bmp, tiff-ish, etc.) to PNG. */
async function imageToPng(file: File): Promise<Attachment | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    return { kind: "image", name: file.name, mediaType: "image/png", data: dataUrl.split(",")[1] };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ─── Public entry point ──────────────────────────────────────────────────── */

/** Normalise one uploaded file into a Claude-ready Attachment (or explain why not). */
export async function readAttachment(file: File): Promise<ReadResult> {
  const e = ext(file.name);
  const type = file.type;
  const un = (reason: string): UnsupportedAttachment => ({ kind: "unsupported", name: file.name, reason });

  // Video / audio — Claude's API cannot process these at all.
  if (type.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(e)) {
    return un("Claude non può analizzare video. Estrai testo/screenshot e caricali.");
  }
  if (type.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "flac"].includes(e)) {
    return un("Claude non può analizzare audio. Trascrivi l'audio e carica il testo.");
  }

  // PDF → document block.
  if (type === "application/pdf" || e === "pdf") {
    return { kind: "pdf", name: file.name, data: toBase64(await file.arrayBuffer()) };
  }

  // Images → image block (native types pass through; others get canvas-converted).
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(e)) {
    if (API_IMAGE_TYPES.includes(type)) {
      return { kind: "image", name: file.name, mediaType: type, data: toBase64(await file.arrayBuffer()) };
    }
    if (e === "svg" || type === "image/svg+xml") {
      // SVG is XML text — send its source; Claude reads markup fine.
      return { kind: "text", name: file.name, text: await file.text() };
    }
    const png = await imageToPng(file);
    return png ?? un(`Formato immagine non supportato da Claude (${type || e}).`);
  }

  // Office documents → extract text (they are ZIP archives of XML).
  const isDocx = e === "docx" || type.includes("wordprocessingml");
  const isPptx = e === "pptx" || type.includes("presentationml");
  const isXlsx = e === "xlsx" || type.includes("spreadsheetml");
  if (isDocx || isPptx || isXlsx) {
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const text = isDocx ? await extractDocx(zip) : isPptx ? await extractPptx(zip) : await extractXlsx(zip);
      if (!text.trim()) return un("Documento vuoto o non leggibile.");
      return { kind: "text", name: file.name, text };
    } catch {
      return un("Impossibile leggere il documento Office (file danneggiato?).");
    }
  }

  // Legacy binary Office (.doc/.ppt/.xls) — old OLE format, not parseable here.
  if (["doc", "ppt", "xls"].includes(e)) {
    return un(`Formato legacy ${e.toUpperCase()}: salva come ${e}x (o PDF) e ricarica.`);
  }

  // Plain text / code / structured text.
  if (type.startsWith("text/") || TEXT_EXTS.has(e)) {
    return { kind: "text", name: file.name, text: await file.text() };
  }

  // Last resort: try to read as UTF-8 text; if it looks binary, decline.
  try {
    const text = await file.text();
    // Heuristic: lots of NULs / replacement chars ⇒ binary.
    const bad = (text.match(/[ �]/g) || []).length;
    if (text.length > 0 && bad / text.length < 0.02) {
      return { kind: "text", name: file.name, text };
    }
  } catch { /* fall through */ }
  return un(`Tipo di file non supportato (${type || e || "sconosciuto"}).`);
}
