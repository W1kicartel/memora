/**
 * Progress analytics for Memora.
 *
 * Everything here is a PURE function of the deck list and the review-event log,
 * so the dashboard can be reconstructed at any time and the logic is fully
 * unit-tested (see stats.test.ts). No React, no DOM, no I/O.
 *
 * Days are bucketed in the local timezone (a student's "today" is their day).
 */
import type { Deck, ReviewEvent } from "./types";

const MS_PER_DAY = 86_400_000;
const MATURE_INTERVAL_DAYS = 21; // SM-2 convention: >= 21d interval == "mature"

/** Local YYYY-MM-DD key for a timestamp. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface DailyStat {
  day: string; // YYYY-MM-DD
  reviews: number;
  correct: number;
  accuracy: number; // 0..1
}

/** Aggregate the event log by local day, ascending. */
export function dailyStats(events: ReviewEvent[]): DailyStat[] {
  const byDay = new Map<string, { reviews: number; correct: number }>();
  for (const e of events) {
    const key = dayKey(e.at);
    const slot = byDay.get(key) ?? { reviews: 0, correct: 0 };
    slot.reviews++;
    if (e.correct) slot.correct++;
    byDay.set(key, slot);
  }
  return [...byDay.entries()]
    .map(([day, s]) => ({
      day,
      reviews: s.reviews,
      correct: s.correct,
      accuracy: s.reviews ? s.correct / s.reviews : 0,
    }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

export interface Streak {
  current: number;
  longest: number;
}

/**
 * Current streak = consecutive days with >= 1 review ending today (or, if you
 * haven't studied yet today, ending yesterday — so the streak isn't "lost"
 * until a full day is missed). Longest = best run ever.
 */
export function streak(events: ReviewEvent[], now: number = Date.now()): Streak {
  const days = new Set(events.map((e) => dayKey(e.at)));
  if (days.size === 0) return { current: 0, longest: 0 };

  // Current streak: walk back from today.
  let current = 0;
  const today = dayKey(now);
  const studiedToday = days.has(today);
  // Start at today if studied today, otherwise yesterday.
  let cursor = studiedToday ? now : now - MS_PER_DAY;
  while (days.has(dayKey(cursor))) {
    current++;
    cursor -= MS_PER_DAY;
  }

  // Longest streak: scan all sorted days.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && dayKey(Date.parse(prev) + MS_PER_DAY) === d) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  return { current, longest };
}

/** Accuracy (0..1) over the trailing `windowDays`, or null if no reviews. */
export function retention(
  events: ReviewEvent[],
  now: number = Date.now(),
  windowDays = 30
): number | null {
  const cutoff = now - windowDays * MS_PER_DAY;
  const recent = events.filter((e) => e.at >= cutoff);
  const pool = recent.length ? recent : events;
  if (pool.length === 0) return null;
  return pool.filter((e) => e.correct).length / pool.length;
}

/** Count of "mature" cards (interval >= 21 days) across all decks. */
export function matureCount(decks: Deck[]): number {
  let n = 0;
  for (const d of decks)
    for (const c of d.cards)
      if (c.schedule.interval >= MATURE_INTERVAL_DAYS) n++;
  return n;
}

export function totalCards(decks: Deck[]): number {
  return decks.reduce((sum, d) => sum + d.cards.length, 0);
}

/** Cards due now (new cards with dueDate 0 count as due). */
export function dueNow(decks: Deck[], now: number = Date.now()): number {
  let n = 0;
  for (const d of decks)
    for (const c of d.cards) if (c.dueDate === 0 || c.dueDate <= now) n++;
  return n;
}

export interface ForecastDay {
  day: string;
  count: number;
}

/**
 * How many cards come due on each of the next `days` days. Overdue and new
 * cards are folded into day 0 ("today").
 */
export function dueForecast(
  decks: Deck[],
  now: number = Date.now(),
  days = 7
): ForecastDay[] {
  const out: ForecastDay[] = [];
  for (let i = 0; i < days; i++) {
    out.push({ day: dayKey(now + i * MS_PER_DAY), count: 0 });
  }
  const todayKey = out[0].day;
  const index = new Map(out.map((f, i) => [f.day, i]));
  for (const d of decks) {
    for (const c of d.cards) {
      if (c.dueDate === 0 || c.dueDate <= now) {
        out[0].count++; // due today / overdue / new
        continue;
      }
      const key = dayKey(c.dueDate);
      const i = index.get(key);
      if (i !== undefined && key !== todayKey) out[i].count++;
    }
  }
  return out;
}

export interface EaseBucket {
  label: string;
  count: number;
}

/** Histogram of card ease factors — spot your hardest material. */
export function easeHistogram(decks: Deck[]): EaseBucket[] {
  const buckets: EaseBucket[] = [
    { label: "Hard\n≤1.7", count: 0 },
    { label: "1.7–2.1", count: 0 },
    { label: "2.1–2.5", count: 0 },
    { label: "Easy\n>2.5", count: 0 },
  ];
  for (const d of decks) {
    for (const c of d.cards) {
      const ef = c.schedule.easeFactor;
      if (ef <= 1.7) buckets[0].count++;
      else if (ef <= 2.1) buckets[1].count++;
      else if (ef <= 2.5) buckets[2].count++;
      else buckets[3].count++;
    }
  }
  return buckets;
}

export interface GradePrediction {
  /** Predicted exam score, 0..100. */
  score: number;
  retention: number; // 0..1
  coverage: number; // 0..1 (mature / total)
  confidence: "low" | "medium" | "high";
}

/**
 * A transparent heuristic that turns your stats into a predicted exam score.
 *
 * score = (0.7 · retention + 0.3 · coverage) · 100
 *   - retention: how often you recall correctly (last 30 days)
 *   - coverage : share of your cards that are "mature" (well-learned)
 *
 * Confidence rises with the number of reviews and how much material is mature.
 * It's an estimate to motivate, not a guarantee.
 */
export function predictGrade(
  decks: Deck[],
  events: ReviewEvent[],
  now: number = Date.now()
): GradePrediction {
  const ret = retention(events, now) ?? 0;
  const total = totalCards(decks);
  const coverage = total ? matureCount(decks) / total : 0;
  const score = Math.round((0.7 * ret + 0.3 * coverage) * 100);

  let confidence: GradePrediction["confidence"] = "low";
  if (events.length >= 100 && coverage >= 0.5) confidence = "high";
  else if (events.length >= 25) confidence = "medium";

  return { score, retention: ret, coverage, confidence };
}

export interface Summary {
  totalCards: number;
  totalReviews: number;
  reviewsToday: number;
  dueNow: number;
  accuracyAllTime: number | null;
}

/** Headline numbers for the dashboard hero row. */
export function summary(
  decks: Deck[],
  events: ReviewEvent[],
  now: number = Date.now()
): Summary {
  const today = dayKey(now);
  const reviewsToday = events.filter((e) => dayKey(e.at) === today).length;
  const correct = events.filter((e) => e.correct).length;
  return {
    totalCards: totalCards(decks),
    totalReviews: events.length,
    reviewsToday,
    dueNow: dueNow(decks, now),
    accuracyAllTime: events.length ? correct / events.length : null,
  };
}
