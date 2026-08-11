/**
 * Dependency-free test suite for the flashcard import parser.
 * Run with:  npx tsx src/import.test.ts
 */
import { parseCards, detectDelimiter } from "./import";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

// --- Delimiter detection ---------------------------------------------------
assert(detectDelimiter("a\tb\nc\td") === "\t", "detects tab");
assert(detectDelimiter("a :: b\nc :: d") === "::", "detects double colon");
assert(detectDelimiter("a | b\nc | d") === "|", "detects pipe");
assert(detectDelimiter("a; b\nc; d") === ";", "detects semicolon");
assert(detectDelimiter("a, b\nc, d") === ",", "detects comma");
// Tab wins over comma when both appear (priority + count).
assert(detectDelimiter("a\tb, x\nc\td, y") === "\t", "tab beats comma");

// --- Tab-separated (Anki / Excel paste) ------------------------------------
{
  const r = parseCards("capital of France\tParis\ncapital of Japan\tTokyo");
  assert(r.delimiter === "\t", "tab import uses tab");
  assert(r.cards.length === 2, "tab import: 2 cards");
  assert(r.cards[0].front === "capital of France", "tab front ok");
  assert(r.cards[0].back === "Paris", "tab back ok");
  assert(r.skipped === 0, "tab import: nothing skipped");
}

// --- Double colon, answer may contain the delimiter ------------------------
{
  const r = parseCards("ratio :: a :: b means a to b");
  assert(r.cards.length === 1, ":: import: 1 card");
  assert(r.cards[0].front === "ratio", ":: front ok");
  assert(
    r.cards[0].back === "a :: b means a to b",
    "split on FIRST delimiter; answer keeps the rest"
  );
}

// --- Comma with CSV quoting ------------------------------------------------
{
  const r = parseCards('"Hello, world","a greeting"\nplain,answer');
  assert(r.delimiter === ",", "csv uses comma");
  assert(r.cards.length === 2, "csv: 2 cards");
  assert(r.cards[0].front === "Hello, world", "quoted field keeps inner comma");
  assert(r.cards[0].back === "a greeting", "quoted back ok");
  assert(r.cards[1].front === "plain" && r.cards[1].back === "answer", "plain csv ok");
}

// --- Escaped quotes inside quoted CSV field --------------------------------
{
  const r = parseCards('"say ""hi""",greeting');
  assert(r.cards[0].front === 'say "hi"', 'doubled "" becomes a literal quote');
}

// --- Blank lines and # comments are ignored --------------------------------
{
  const r = parseCards("# header\n\nfront1\tback1\n   \nfront2\tback2\n");
  assert(r.cards.length === 2, "blank lines and # comments skipped");
}

// --- Lines without a delimiter / empty side are skipped ---------------------
{
  const r = parseCards("good\tanswer\nnoseparatorhere\nempty\t");
  assert(r.cards.length === 1, "only the valid line becomes a card");
  assert(r.skipped === 2, "two bad lines skipped (no delim, empty back)");
}

// --- Forced delimiter overrides detection ----------------------------------
{
  const r = parseCards("a,b;c", { delimiter: ";" });
  assert(r.delimiter === ";", "forced delimiter honoured");
  assert(r.cards[0].front === "a,b" && r.cards[0].back === "c", "forced split ok");
}

// --- Whitespace is trimmed -------------------------------------------------
{
  const r = parseCards("  spaced front  |  spaced back  ");
  assert(r.cards[0].front === "spaced front", "front trimmed");
  assert(r.cards[0].back === "spaced back", "back trimmed");
}

// --- Empty input -----------------------------------------------------------
{
  const r = parseCards("");
  assert(r.cards.length === 0 && r.skipped === 0, "empty input -> no cards");
}

console.log(`\nImport tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
