/**
 * Dependency-free test suite for the notable-moments detector.
 * Run with:  npx tsx src/moments.test.ts
 */
import { detectMoments, describeMoment, type Moment, type MomentKind } from "./moments";
import type { ReviewEvent } from "./types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

const DAY = 86_400_000;
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const ev = (at: number, correct: boolean): ReviewEvent => ({
  at,
  deckId: "d",
  cardId: "c",
  quality: correct ? 4 : 1,
  correct,
});

const has = (ms: Moment[], kind: MomentKind, value: number) =>
  ms.some((m) => m.kind === kind && m.value === value);
const only = (ms: Moment[], kind: MomentKind) => ms.filter((m) => m.kind === kind);

// A run of `n` consecutive daily reviews starting at `base` (all in June -> no DST).
const streak = (base: number, n: number, correct = true): ReviewEvent[] =>
  Array.from({ length: n }, (_, i) => ev(base + i * DAY, correct));

// --- empty -----------------------------------------------------------------
assert(detectMoments([]).length === 0, "no events -> no moments");

// --- everyday noise makes NO moments ---------------------------------------
{
  // 3 days, a couple reviews each: below every threshold.
  const base = noon(2024, 6, 1);
  const events = [ev(base, true), ev(base + DAY, true)];
  assert(detectMoments(events, base + DAY).length === 0, "trivial activity is silent");
}

// --- streak milestone ------------------------------------------------------
{
  const base = noon(2024, 6, 1);
  const events = streak(base, 7);
  const m = detectMoments(events, base + 6 * DAY);
  assert(m.length === 1, "a clean 7-day streak yields exactly one moment");
  assert(has(m, "streak-milestone", 7), "streak-milestone at 7 days");
}

// --- comeback + lost streak (a broken 30-day run, then resumption) ---------
{
  const base = noon(2024, 6, 1);
  const events = [
    ...streak(base, 30), //           June 1..30
    ev(base + 32 * DAY, true), //      resume July 3 (2 full days missed)
  ];
  const m = detectMoments(events, base + 40 * DAY);
  assert(has(m, "streak-milestone", 7), "milestone at 7");
  assert(has(m, "streak-milestone", 30), "milestone at 30");
  assert(has(m, "streak-lost", 30), "losing a 30-day streak is a setback");
  assert(has(m, "comeback", 30), "returning after the break is a comeback");
  assert(only(m, "streak-lost")[0].tone === "setback", "lost streak is toned as setback");
  assert(only(m, "comeback")[0].tone === "grit", "comeback is toned as grit");
}

// --- trailing lost streak (run ends and never resumes before `now`) --------
{
  const base = noon(2024, 6, 1);
  const events = streak(base, 30); // ends June 30
  const m = detectMoments(events, base + 40 * DAY); // now = mid-July
  assert(has(m, "streak-lost", 30), "a stale 30-day streak counts as lost");
}

// --- a streak still alive today is NOT a setback ---------------------------
{
  const base = noon(2024, 6, 1);
  const events = streak(base, 30);
  const m = detectMoments(events, base + 29 * DAY); // now = last study day
  assert(only(m, "streak-lost").length === 0, "live streak is never a setback");
  assert(has(m, "streak-milestone", 30), "…but the 30-day milestone still lands");
}

// --- short broken streaks are noise (below setback/comeback thresholds) -----
{
  const base = noon(2024, 6, 1);
  const events = [...streak(base, 3), ev(base + 10 * DAY, true)];
  const m = detectMoments(events, base + 12 * DAY);
  assert(only(m, "streak-lost").length === 0, "losing a 3-day streak is not announced");
  assert(only(m, "comeback").length === 0, "returning from a 3-day break is not announced");
}

// --- personal-best day (a record must beat a previous best) ----------------
{
  const day = (base: number, k: number) => Array.from({ length: k }, (_, j) => ev(base + j, true));
  const events = [
    ...day(noon(2024, 6, 1), 12), // baseline (first, not a "record")
    ...day(noon(2024, 6, 3), 15), // beats 12 -> record
    ...day(noon(2024, 6, 5), 10), // below 15 -> not a record
  ];
  const pb = only(detectMoments(events, noon(2024, 6, 6)), "personal-best-day");
  assert(pb.length === 1 && pb[0].value === 15, "one personal best, value 15");
}

// --- volume milestone ------------------------------------------------------
{
  const base = noon(2024, 6, 1);
  const events = Array.from({ length: 100 }, (_, i) => ev(base + i, true));
  assert(has(detectMoments(events, base + DAY), "volume-milestone", 100), "100 cumulative reviews");
}

// --- hot streak ------------------------------------------------------------
{
  const base = noon(2024, 6, 1);
  const events = Array.from({ length: 20 }, (_, i) => ev(base + i, true));
  assert(has(detectMoments(events, base + DAY), "hot-streak", 20), "20 correct in a row");
}
{
  // a wrong answer resets the run
  const base = noon(2024, 6, 1);
  const events = [...Array.from({ length: 19 }, (_, i) => ev(base + i, true)), ev(base + 19, false)];
  assert(only(detectMoments(events, base + DAY), "hot-streak").length === 0, "a miss breaks the run");
}

// --- narration -------------------------------------------------------------
{
  const line = describeMoment({ at: 0, kind: "streak-milestone", tone: "triumph", value: 30 });
  assert(line.includes("30"), "describeMoment mentions the value");
}

console.log(`\nMoments tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
