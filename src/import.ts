/**
 * Bulk-import parser for flashcards.
 *
 * Turns a block of text (pasted, or read from an uploaded .csv/.tsv/.txt file)
 * into front/back card pairs so a whole deck can be created in seconds.
 *
 * Pure and framework-agnostic — no React, no DOM — so it is fully unit-tested
 * (see import.test.ts).
 *
 * Supported, one card per line:
 *   front <TAB> back        (tab-separated, e.g. Anki export / Excel paste)
 *   front :: back           (double colon)
 *   front | back            (pipe)
 *   front ; back            (semicolon)
 *   front , back            (comma, with basic CSV quoting)
 *
 * Blank lines and lines starting with `#` are ignored. The delimiter is
 * auto-detected from the text, but can be forced via options.delimiter.
 */

export interface ParsedCard {
  front: string;
  back: string;
}

export interface ImportResult {
  cards: ParsedCard[];
  /** Lines that could not be parsed (no delimiter / empty side). */
  skipped: number;
  /** The delimiter that was used. */
  delimiter: Delimiter;
}

export type Delimiter = "\t" | "::" | "|" | ";" | ",";

/** Detection priority — earlier wins ties. */
const DELIMITERS: Delimiter[] = ["\t", "::", "|", ";", ","];

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

/**
 * Pick the delimiter that appears in the most lines. Ties are broken by the
 * DELIMITERS priority order (tab first). Defaults to comma if none is found.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = meaningfulLines(text);
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = lines.filter((l) => l.includes(d)).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Parse one comma-delimited line with basic CSV quoting:
 * double quotes wrap a field, and "" is an escaped quote inside a field.
 * Returns the list of fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

/** Split a single line into [front, back] for a given delimiter. */
function splitLine(line: string, delimiter: Delimiter): [string, string] | null {
  if (delimiter === ",") {
    const fields = parseCsvLine(line);
    if (fields.length < 2) return null;
    const front = fields[0].trim();
    // Join any extra columns back into the answer so trailing commas survive.
    const back = fields.slice(1).join(",").trim();
    if (!front || !back) return null;
    return [front, back];
  }

  // Split on the FIRST occurrence so the answer may contain the delimiter.
  const idx = line.indexOf(delimiter);
  if (idx === -1) return null;
  const front = line.slice(0, idx).trim();
  const back = line.slice(idx + delimiter.length).trim();
  if (!front || !back) return null;
  return [front, back];
}

/**
 * Parse a block of text into flashcards.
 *
 * @param text  Raw text (pasted or read from a file).
 * @param options.delimiter  Force a delimiter instead of auto-detecting.
 */
export function parseCards(
  text: string,
  options: { delimiter?: Delimiter } = {}
): ImportResult {
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const lines = meaningfulLines(text);
  const cards: ParsedCard[] = [];
  let skipped = 0;

  for (const line of lines) {
    const pair = splitLine(line, delimiter);
    if (!pair) {
      skipped++;
      continue;
    }
    cards.push({ front: pair[0], back: pair[1] });
  }

  return { cards, skipped, delimiter };
}
