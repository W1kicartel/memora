/**
 * Dependency-free test suite for the stats engine.
 * Run with:  npx tsx src/stats.test.ts
 */
import {
  dayKey,
  dailyStats,
  streak,
  retention,
  matureCount,
  dueForecast,
  easeHistogram,
  predictGrade,
  summary,
} from "./stats";
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

// Local noon timestamps keep the day stable regardless of timezone.
const noon = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 12, 0, 0).getTime();

const ev = (at: number, correct: boolean): ReviewEvent => ({
  at,
  deckId: "d",
  cardId: "c",
  quality: correct ? 4 : 1,
  correct,
});

function card(interval: number, ease = 2.5, dueDate = 0): Card {
  return {
    id: Math.random().toString(36),
    front: "f",
    back: "b",
    schedule: { repetitions: 1, easeFactor: ease, interval },
    dueDate,
    createdAt: 0,
  };
}
const deck = (cards: Card[]): Deck => ({ id: "d", name: "Deck", cards });

// --- dayKey ----------------------------------------------------------------
assert(dayKey(noon(2024, 1, 5)) === "2024-01-05", "dayKey formats YYYY-MM-DD");
assert(dayKey(noon(2024, 12, 31)) === "2024-12-31", "dayKey month/day padding");

// --- dailyStats ------------------------------------------------------------
{
  const events = [
    ev(noon(2024, 1, 1), true),
    ev(noon(2024, 1, 1), false),
    ev(noon(2024, 1, 2), true),
  ];
  const ds = dailyStats(events);
  assert(ds.length === 2, "dailyStats groups by day");
  assert(ds[0].day === "2024-01-01" && ds[0].reviews === 2, "day 1 has 2 reviews");
  assert(Math.abs(ds[0].accuracy - 0.5) < 1e-9, "day 1 accuracy 0.5");
  assert(ds[1].reviews === 1 && ds[1].correct === 1, "day 2 fully correct");
  assert(dailyStats([]).length === 0, "empty events -> no daily stats");
}

// --- streak ----------------------------------------------------------------
{
  const today = noon(2024, 3, 10);
  const events = [
    ev(noon(2024, 3, 8), true),
    ev(noon(2024, 3, 9), true),
    ev(noon(2024, 3, 10), true),
  ];
  const s = streak(events, today);
  assert(s.current === 3, "3-day current streak ending today");
  assert(s.longest === 3, "3-day longest streak");
}
{
  // Studied yesterday but not today -> streak not yet lost.
  const today = noon(2024, 3, 10);
  const events = [ev(noon(2024, 3, 8), true), ev(noon(2024, 3, 9), true)];
  assert(streak(events, today).current === 2, "streak counts up to yesterday");
}
{
  // A gap breaks the current streak.
  const today = noon(2024, 3, 10);
  const events = [
    ev(noon(2024, 3, 5), true),
    ev(noon(2024, 3, 6), true),
    ev(noon(2024, 3, 10), true),
  ];
  const s = streak(events, today);
  assert(s.current === 1, "gap resets current streak to today only");
  assert(s.longest === 2, "longest streak survives the gap");
}
assert(streak([], noon(2024, 1, 1)).current === 0, "no events -> 0 streak");

// --- retention -------------------------------------------------------------
{
  const now = noon(2024, 6, 1);
  const events = [
    ev(now, true),
    ev(now, true),
    ev(now, false),
    ev(now, true),
  ];
  const r = retention(events, now);
  assert(r !== null && Math.abs(r - 0.75) < 1e-9, "retention = 3/4");
  assert(retention([], now) === null, "no events -> null retention");
}
{
  // Old events fall outside the 30-day window.
  const now = noon(2024, 6, 1);
  const events = [ev(noon(2024, 1, 1), false), ev(now, true)];
  const r = retention(events, now, 30);
  assert(r === 1, "only in-window events count (recent all correct)");
}

// --- matureCount / totals --------------------------------------------------
{
  const d = deck([card(30), card(21), card(5), card(1)]);
  assert(matureCount([d]) === 2, "two cards interval >= 21 are mature");
}

// --- dueForecast -----------------------------------------------------------
{
  const now = noon(2024, 4, 1);
  const d = deck([
    card(0, 2.5, 0), // new -> today
    card(0, 2.5, now - 1000), // overdue -> today
    card(0, 2.5, noon(2024, 4, 2)), // tomorrow
    card(0, 2.5, noon(2024, 4, 3)), // +2
    card(0, 2.5, noon(2024, 4, 20)), // outside 7-day window
  ]);
  const f = dueForecast([d], now, 7);
  assert(f.length === 7, "forecast covers 7 days");
  assert(f[0].count === 2, "today bucket = new + overdue");
  assert(f[1].count === 1, "tomorrow has 1");
  assert(f[2].count === 1, "day +2 has 1");
  assert(f[6].count === 0, "far card excluded from window");
}

// --- easeHistogram ---------------------------------------------------------
{
  const d = deck([card(1, 1.5), card(1, 2.0), card(1, 2.3), card(1, 2.8)]);
  const h = easeHistogram([d]);
  assert(h[0].count === 1 && h[3].count === 1, "ease buckets spread correctly");
  assert(h.reduce((s, b) => s + b.count, 0) === 4, "all cards bucketed");
}

// --- predictGrade ----------------------------------------------------------
{
  const now = noon(2024, 7, 1);
  const d = deck([card(30), card(30), card(1), card(1)]); // coverage 0.5
  const events = Array.from({ length: 40 }, () => ev(now, true)); // retention 1
  const p = predictGrade([d], events, now);
  // score = (0.7*1 + 0.3*0.5)*100 = 85
  assert(p.score === 85, "grade prediction matches heuristic");
  assert(p.confidence === "medium", "25..99 reviews -> medium confidence");
  assert(p.score >= 0 && p.score <= 100, "score within 0..100");
}
{
  const p = predictGrade([], [], noon(2024, 7, 1));
  assert(p.score === 0 && p.confidence === "low", "no data -> 0 / low");
}

// --- summary ---------------------------------------------------------------
{
  const now = noon(2024, 8, 5);
  const d = deck([card(1, 2.5, 0), card(1, 2.5, noon(2024, 8, 20))]);
  const events = [ev(now, true), ev(noon(2024, 8, 4), false)];
  const s = summary([d], events, now);
  assert(s.totalCards === 2, "summary total cards");
  assert(s.totalReviews === 2, "summary total reviews");
  assert(s.reviewsToday === 1, "summary reviews today");
  assert(s.dueNow === 1, "summary due now (only the new card)");
}

console.log(`\nStats tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
