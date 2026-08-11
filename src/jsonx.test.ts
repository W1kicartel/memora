/**
 * Dependency-free tests for tolerant JSON extraction.
 * Run with:  npx tsx src/jsonx.test.ts
 */
import { extractJson, salvageArray } from "./jsonx";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

// --- extractJson ------------------------------------------------------------
{
  assert(extractJson<{ a: number }>('{"a":1}')?.a === 1, "bare object parses");
  assert(extractJson<number[]>("ecco: [1,2,3] fine")?.length === 3, "array inside prose parses");
  assert(extractJson<{ a: number }>('```json\n{"a":2}\n```')?.a === 2, "fenced json parses");
  assert(extractJson("nessun json qui") === null, "no json → null");
  assert(extractJson('{"broken": ') === null, "truncated object → null");
}

// --- salvageArray -----------------------------------------------------------
{
  const clean = salvageArray<{ id: number }>('[{"id":1},{"id":2}]');
  assert(clean.length === 2 && clean[1].id === 2, "clean array salvages fully");

  // Truncated mid-second-object: first item must survive.
  const cut = salvageArray<{ front: string }>('[{"front":"A","back":"x"},{"front":"B","ba');
  assert(cut.length === 1 && cut[0].front === "A", "truncated array yields complete items only");

  // Braces and brackets inside strings must not confuse the scanner.
  const tricky = salvageArray<{ q: string }>(
    '[{"q":"cosa dice {Miller} su [7±2]? \\"chunking\\""},{"q":"ok"}]',
  );
  assert(tricky.length === 2 && tricky[0].q.includes("{Miller}"), "braces/brackets inside strings are ignored");

  // Escaped backslash right before a quote.
  const esc = salvageArray<{ s: string }>('[{"s":"path\\\\"},{"s":"b"}]');
  assert(esc.length === 2, "escaped backslash before closing quote handled");

  // Fenced + truncated.
  const fenced = salvageArray<{ n: number }>('```json\n[{"n":1},{"n":2},{"n":\n');
  assert(fenced.length === 2, "fenced truncated array salvages complete items");

  assert(salvageArray("niente array").length === 0, "no array → empty");

  // Stops cleanly at the closing bracket (trailing junk ignored).
  const trailing = salvageArray<{ n: number }>('[{"n":1}] {"n":99}');
  assert(trailing.length === 1, "content after a closed array is ignored");
}

console.log(`\nJsonx tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
