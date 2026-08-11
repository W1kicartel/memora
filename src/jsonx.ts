/**
 * jsonx.ts — tolerant JSON extraction for model output.
 *
 * Model replies wrap JSON in prose or code fences, and long generations can be
 * cut off mid-array by the output-token limit. These helpers deal with both:
 *
 *   extractJson()  — find and parse the first JSON value in a blob of text.
 *   salvageArray() — recover every COMPLETE top-level object from a possibly
 *                    truncated JSON array, discarding the broken tail.
 *
 * Pure string processing — no network, no DOM. Tested in jsonx.test.ts.
 */

/** Strip a ```json fence if present, otherwise return the text unchanged. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : text;
}

/** Parse the first JSON array/object found in the text. Null if unparsable. */
export function extractJson<T>(text: string): T | null {
  const candidate = unfence(text);
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  const end = candidate.lastIndexOf(close);
  if (end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Best-effort recovery of items from a (possibly truncated) JSON array of
 * objects. Scans from the first "[", tracking brace depth and string state,
 * and parses each balanced top-level {...} individually — so a generation cut
 * off mid-object still yields every complete item before the break.
 */
export function salvageArray<T>(text: string): T[] {
  const candidate = unfence(text);
  const start = candidate.indexOf("[");
  if (start === -1) return [];

  const items: T[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = start + 1; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          items.push(JSON.parse(candidate.slice(objStart, i + 1)) as T);
        } catch { /* skip malformed item */ }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break; // clean end of the array
    }
  }
  return items;
}
