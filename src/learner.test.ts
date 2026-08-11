/**
 * Dependency-free tests for the adaptive learner profile.
 * Run with:  npx tsx src/learner.test.ts
 */
import { analyzeLearner, learnerDirectiveFrom } from "./learner";
import type { Deck, ReviewEvent } from "./types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

const NOW = new Date("2026-08-11T12:00:00").getTime();
const DAY = 86_400_000;
const deck = (id: string, name: string): Deck => ({ id, name, cards: [] });
const ev = (deckId: string, correct: boolean, daysAgo = 1): ReviewEvent =>
  ({ at: NOW - daysAgo * DAY, deckId, cardId: "c", quality: correct ? 4 : 2, correct });

const decks = [deck("d1", "Neuroanatomia"), deck("d2", "Storia"), deck("d3", "Micro")];

// --- thin data stays silent --------------------------------------------------
{
  const few = Array.from({ length: 10 }, () => ev("d1", true));
  const ins = analyzeLearner(decks, few, NOW);
  assert(learnerDirectiveFrom(ins) === "", "under 20 reviews → empty directive (no noise)");
  assert(learnerDirectiveFrom(analyzeLearner(decks, [], NOW)) === "", "no events → empty directive");
}

// --- weak/strong classification ---------------------------------------------
{
  const events: ReviewEvent[] = [
    // Neuroanatomia: 20 reviews, 40% — weak
    ...Array.from({ length: 8 }, () => ev("d1", true)),
    ...Array.from({ length: 12 }, () => ev("d1", false)),
    // Storia: 20 reviews, 90% — strong
    ...Array.from({ length: 18 }, () => ev("d2", true)),
    ...Array.from({ length: 2 }, () => ev("d2", false)),
    // Micro: only 5 reviews — below per-deck threshold, ignored
    ...Array.from({ length: 5 }, () => ev("d3", false)),
  ];
  const ins = analyzeLearner(decks, events, NOW);
  assert(ins.totalReviews === 45, "counts every review");
  assert(ins.weak.length === 1 && ins.weak[0].name === "Neuroanatomia", "40% deck is weak");
  assert(ins.strong.length === 1 && ins.strong[0].name === "Storia", "90% deck is strong");
  assert(!ins.weak.some((s) => s.name === "Micro") && !ins.strong.some((s) => s.name === "Micro"),
    "decks under 10 reviews are ignored");

  const dir = learnerDirectiveFrom(ins);
  assert(dir.includes("PROFILO DELLO STUDENTE"), "directive carries the header");
  assert(dir.includes("Neuroanatomia") && dir.includes("40%"), "directive names the weak deck with accuracy");
  assert(dir.includes("Storia") && dir.includes("90%"), "directive names the strong deck");
}

// --- recent focus window -----------------------------------------------------
{
  const events: ReviewEvent[] = [
    ...Array.from({ length: 15 }, () => ev("d2", true, 30)),  // old: outside 14-day window
    ...Array.from({ length: 12 }, () => ev("d1", true, 2)),   // recent
  ];
  const ins = analyzeLearner(decks, events, NOW);
  assert(ins.recentFocus.length === 1 && ins.recentFocus[0] === "Neuroanatomia",
    "recent focus only counts the last 14 days");
}

// --- deleted decks don't leak ------------------------------------------------
{
  const events = Array.from({ length: 25 }, () => ev("ghost", false));
  const ins = analyzeLearner(decks, events, NOW);
  assert(ins.weak.length === 0, "events for deleted decks are skipped");
  assert(learnerDirectiveFrom(ins).includes("25 ripassi"), "totals still count them");
}

console.log(`\nLearner tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
