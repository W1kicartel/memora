/* markdown.tsx — a tiny, dependency-free Markdown renderer for model output.
   Handles just enough — headings, bullet/numbered lists, bold, inline code,
   tables, fenced code blocks (incl. Mermaid), blockquote "boxes" and paragraphs
   — so AI study notes read cleanly instead of showing raw markup.
   Not a spec-compliant parser; deliberately small and safe (no raw HTML). */

import React from "react";
import { parseConceptMap, ConceptMapView } from "./conceptmap";

/** Inline pass: **bold** → <strong>, `code` → <code>. */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+?)`/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={key++}>{m[1]}</strong>);
    else nodes.push(<code key={key++}>{m[2]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Split a table row "| a | b |" into trimmed cells. */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** A `| --- | :--: |` separator line marks the previous line as a table header. */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{renderInline(it)}</li>);
    blocks.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Fenced code block (```lang ... ```). "conceptmap" fences render as a
    // schematic mnemonic map; anything else stays labelled + monospace.
    const fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      flushList();
      const lang = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      const source = body.join("\n");
      if (lang === "conceptmap") {
        const map = parseConceptMap(source);
        if (map) {
          blocks.push(<ConceptMapView key={key++} data={map} />);
          continue;
        }
        // Unparsable map → fall through to the plain code block below.
      }
      blocks.push(
        <pre key={key++} className={`md-code${lang ? ` lang-${lang}` : ""}`}>
          {lang && <span className="md-code-lang">{lang}</span>}
          <code>{source}</code>
        </pre>
      );
      continue;
    }

    if (!line.trim()) { flushList(); continue; }

    // Table: a header row followed by a |---|---| separator.
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const header = splitRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--; // step back; the for-loop will advance
      blocks.push(
        <div key={key++} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>{header.map((h, j) => <th key={j}>{renderInline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 4);
      blocks.push(
        <p key={key++} className={`md-h md-h${level}`}>{renderInline(heading[2])}</p>
      );
      continue;
    }

    // Blockquote — used for the 🔬 experiment / ⚠️ exam-trap boxes.
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushList();
      const body: string[] = [quote[1]];
      while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) {
        body.push(lines[i + 1].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="md-box">
          {body.map((b, bi) => <p key={bi} className="md-p">{renderInline(b)}</p>)}
        </blockquote>
      );
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) { flushList(); continue; } // horizontal rule

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[2]);
      continue;
    }

    flushList();
    blocks.push(<p key={key++} className="md-p">{renderInline(line)}</p>);
  }
  flushList();

  return <div className={className}>{blocks}</div>;
}
