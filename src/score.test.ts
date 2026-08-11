/**
 * Dependency-free test suite for the reputation engine.
 * Run with:  npx tsx src/score.test.ts
 */
import {
  mastery,
  progress,
  proofOfStudyPoints,
  reputation,
  DEFAULT_SCORING,
} from "./score";
import type { Card, Deck, ReviewEvent } from "./types";

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

function card(id: string, interval: number): Card {
  return {
    id,
    front: "f",
    back: "b",
    schedule: { repetitions: 1, easeFactor: 2.5, interval },
    dueDate: 0,
    createdAt: 0,
  };
}
const deck = (cards: Card[]): Deck => ({ id: "d", name: "Deck", cards });
const ev = (at: number, correct: boolean, cardId = "c"): ReviewEvent => ({
  at,
  deckId: "d",
  cardId,
  quality: correct ? 4 : 1,
  correct,
});

// --- mastery ---------------------------------------------------------------
{
  const now = noon(2024, 7, 1);
  const d = deck([card("m1", 30), card("m2", 30), card("n1", 1), card("n2", 1)]); // coverage 0.5
  const events = Array.from({ length: 40 }, () => ev(now, true)); // retention 1
  // (0.7*1 + 0.3*0.5) * 100 = 85
  assert(mastery([d], events, now) === 85, "mastery blends retention and coverage");
}
assert(mastery([], [], noon(2024, 7, 1)) === 0, "no data -> mastery 0");

// --- progress --------------------------------------------------------------
{
  const now = noon(2024, 7, 1);
  const events = [
    // prior window (14..28d ago): all wrong -> retention 0
    ...Array.from({ length: 4 }, () => ev(now - 20 * DAY, false)),
    // recent window (0..14d ago): all right -> retention 1
    ...Array.from({ length: 4 }, () => ev(now - 7 * DAY, true)),
  ];
  assert(progress(events, now) === 100, "improving from 0 to 1 -> progress 100");
}
assert(progress([], noon(2024, 7, 1)) === 50, "not enough history -> neutral 50");

// --- proof of study --------------------------------------------------------
{
  // one mature card (interval 30 -> weight 2.5), two correct reviews same day
  const d = deck([card("c", 30)]);
  const day = noon(2024, 6, 1);
  const events = [ev(day, true), ev(day + 1, true)];
  assert(proofOfStudyPoints([d], events) === 5, "2 correct on a mature card = 2*2.5 = 5");
}
{
  // incorrect reviews never score
  const d = deck([card("c", 30)]);
  const day = noon(2024, 6, 1);
  const events = [ev(day, true), ev(day + 1, true), ev(day + 2, false), ev(day + 3, false)];
  assert(proofOfStudyPoints([d], events) === 5, "wrong answers add nothing");
}
{
  // daily soft cap: 50 new-card points in one day taper past the cap of 40
  const d = deck([card("c", 1)]); // weight 1
  const day = noon(2024, 6, 1);
  const events = Array.from({ length: 50 }, (_, i) => ev(day + i, true));
  // 40 + (50-40)*0.25 = 42.5 -> 43
  assert(proofOfStudyPoints([d], events) === 43, "farming one day hits diminishing returns");
}
{
  // spreading the work across days avoids the cap
  const d = deck([card("c", 1)]);
  const d1 = noon(2024, 6, 1);
  const d2 = noon(2024, 6, 2);
  const events = [
    ...Array.from({ length: 40 }, (_, i) => ev(d1 + i, true)),
    ...Array.from({ length: 40 }, (_, i) => ev(d2 + i, true)),
  ];
  assert(proofOfStudyPoints([d], events) === 80, "two capped days sum cleanly");
}
assert(DEFAULT_SCORING.weightMature > DEFAULT_SCORING.weightNew, "mature cards weigh more");

// --- reputation bundle -----------------------------------------------------
{
  const now = noon(2024, 7, 1);
  const d = deck([card("c", 30)]);
  const events = [ev(now, true), ev(now + 1, true)];
  const r = reputation([d], events, now);
  assert(
    typeof r.mastery === "number" && typeof r.progress === "number" && typeof r.effort === "number",
    "reputation returns all three axes",
  );
  assert(r.effort === proofOfStudyPoints([d], events), "bundle effort matches the standalone");
}

console.log(`\nScore tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
