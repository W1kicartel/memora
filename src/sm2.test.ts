/**
 * Dependency-free test suite for the SM-2 engine.
 *
 * Run with any TypeScript runner, e.g.:  npx tsx src/sm2.test.ts
 * Exits non-zero if any assertion fails, so it works in CI.
 */
import {
  review,
  INITIAL_STATE,
  nextDueDate,
  isDue,
  type ReviewState,
  type Quality,
} from "./sm2";

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

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

// --- Initial state ---------------------------------------------------------
assert(INITIAL_STATE.repetitions === 0, "initial repetitions is 0");
assert(INITIAL_STATE.easeFactor === 2.5, "initial ease factor is 2.5");
assert(INITIAL_STATE.interval === 0, "initial interval is 0");

// --- Successful schedule progression (always quality 5) --------------------
let s: ReviewState = { ...INITIAL_STATE };
s = review(s, 5);
assert(s.repetitions === 1 && s.interval === 1, "1st pass -> interval 1 day");
assert(approx(s.easeFactor, 2.6), "ease rises to 2.6 after perfect answer");

s = review(s, 5);
assert(s.repetitions === 2 && s.interval === 6, "2nd pass -> interval 6 days");
assert(approx(s.easeFactor, 2.7), "ease rises to 2.7");

s = review(s, 5);
// interval = round(6 * 2.8) = 17  (ease becomes 2.8 first)
assert(approx(s.easeFactor, 2.8), "ease rises to 2.8");
assert(s.repetitions === 3, "repetitions now 3");
assert(s.interval === 17, "3rd pass -> round(6 * 2.8) = 17 days");

// --- Ease factor floor never drops below 1.3 -------------------------------
let hard: ReviewState = { ...INITIAL_STATE };
for (let i = 0; i < 10; i++) hard = review(hard, 3);
assert(hard.easeFactor >= 1.3, "ease factor floored at 1.3");
assert(approx(hard.easeFactor, 1.3), "repeated q=3 drives ease to the 1.3 floor");

// --- A lapse (quality < 3) resets repetitions & interval -------------------
let lapsing: ReviewState = { repetitions: 5, easeFactor: 2.5, interval: 40 };
const before = lapsing.easeFactor;
lapsing = review(lapsing, 1);
assert(lapsing.repetitions === 0, "lapse resets repetitions to 0");
assert(lapsing.interval === 1, "lapse resets interval to 1 day");
assert(lapsing.easeFactor < before, "lapse reduces (keeps) the ease factor");

// quality 2 is still a lapse (threshold is 3)
let edge: ReviewState = { repetitions: 3, easeFactor: 2.0, interval: 20 };
edge = review(edge, 2);
assert(edge.repetitions === 0 && edge.interval === 1, "q=2 is a lapse");

// quality 3 is a pass
let passEdge: ReviewState = { ...INITIAL_STATE };
passEdge = review(passEdge, 3);
assert(passEdge.repetitions === 1 && passEdge.interval === 1, "q=3 is a pass");

// --- Purity: input state is not mutated ------------------------------------
const original: ReviewState = { repetitions: 2, easeFactor: 2.5, interval: 6 };
const snapshot = JSON.stringify(original);
review(original, 4);
assert(JSON.stringify(original) === snapshot, "review() does not mutate input");

// --- Input validation ------------------------------------------------------
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
assert(throws(() => review(INITIAL_STATE, 6 as Quality)), "quality 6 rejected");
assert(throws(() => review(INITIAL_STATE, -1 as Quality)), "quality -1 rejected");
assert(throws(() => review(INITIAL_STATE, 2.5 as Quality)), "non-integer rejected");

// --- Due-date helpers ------------------------------------------------------
const now = 1_000_000_000_000;
const due = nextDueDate({ repetitions: 1, easeFactor: 2.5, interval: 6 }, now);
assert(due === now + 6 * 86_400_000, "nextDueDate adds interval in days");
assert(isDue(now - 1, now) === true, "past due date is due");
assert(isDue(now + 1, now) === false, "future due date is not due");

// --- Report ----------------------------------------------------------------
console.log(`\nSM-2 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
