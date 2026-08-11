/**
 * score.ts — the reputation engine (Fase 0).
 *
 * Turns the deck list and the review-event log into REPUTATION: a score that is
 * earned, never bought (see docs/vision.md §6, the firewall). Everything here is
 * a PURE function of data the app already produces, in the same spirit as
 * stats.ts — reconstructable, testable, no React/DOM/I/O.
 *
 * Three axes ship in Fase 0, all computable locally with no backend:
 *   • mastery  — how well you actually remember (retention + coverage)
 *   • progress — whether you are IMPROVING (rewards the trend, not the level)
 *   • effort   — "proof of study": difficulty-weighted, rate-limited work
 *
 * The remaining vision axes (Traguardi, Obiettivi di gruppo, Insegnare) need
 * cross-user interaction, so they arrive with the Fase 1 backend.
 *
 * Anti-cheat by construction (vision §11): effort counts only CORRECT recall,
 * weighted by card maturity (which takes weeks of spaced success to earn) and
 * capped per day (so you cannot farm a high score in one sitting). Selecting a
 * hard level is free; being right on hard, matured material is not.
 *
 * Tested in score.test.ts.
 */
import type { Deck, ReviewEvent } from "./types";
import { dayKey, matureCount, retention, totalCards } from "./stats";

const MS_PER_DAY = 86_400_000;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/* ─── mastery ──────────────────────────────────────────────────────────────
 * Padronanza: 70% how often you recall correctly (last 30 days), 30% how much
 * of your material is "mature" (well-learned). Mirrors the transparent grade
 * heuristic, exposed as a 0..100 reputation axis.
 */
export const MASTERY_RETENTION_WEIGHT = 0.7;
export const MASTERY_COVERAGE_WEIGHT = 0.3;

export function mastery(decks: Deck[], events: ReviewEvent[], now: number = Date.now()): number {
  const ret = retention(events, now) ?? 0;
  const total = totalCards(decks);
  const coverage = total ? matureCount(decks) / total : 0;
  return Math.round((MASTERY_RETENTION_WEIGHT * ret + MASTERY_COVERAGE_WEIGHT * coverage) * 100);
}

/* ─── progress ─────────────────────────────────────────────────────────────
 * Progresso: are you getting better? Compares recall in the most recent window
 * with the window before it. 50 = stable, > 50 improving, < 50 slipping. Neutral
 * (50) when there isn't enough history to judge — we never punish a fresh start.
 */
function windowRetention(events: ReviewEvent[], start: number, end: number): number | null {
  const pool = events.filter((e) => e.at >= start && e.at < end);
  if (pool.length === 0) return null;
  return pool.filter((e) => e.correct).length / pool.length;
}

export function progress(
  events: ReviewEvent[],
  now: number = Date.now(),
  windowDays = 14,
): number {
  const w = windowDays * MS_PER_DAY;
  const recent = windowRetention(events, now - w, now);
  const prior = windowRetention(events, now - 2 * w, now - w);
  if (recent === null || prior === null) return 50; // not enough history → neutral
  const delta = recent - prior; // -1..1
  return clamp(Math.round(50 + delta * 50), 0, 100);
}

/* ─── effort (proof of study) ──────────────────────────────────────────────
 * The cheat-resistant work signal. Only CORRECT reviews score, each weighted by
 * the card's maturity (a proxy for earned difficulty), with diminishing returns
 * past a daily soft cap so no single marathon can inflate the number.
 *
 * NOTE: maturity is read from the card's CURRENT interval, an approximation of
 * its difficulty when reviewed. A precise proof-of-study wants the interval (or
 * a Bloom/difficulty tag) captured ON the ReviewEvent — tracked as an extension
 * in vision §16; the shape here is designed to accept it later unchanged.
 */
export interface ScoringConfig {
  weightNew: number;
  weightMaturing: number;
  weightMature: number;
  maturingDays: number; // interval >= this → "maturing"
  matureDays: number; //   interval >= this → "mature"
  dailySoftCap: number; // weighted points/day beyond which returns taper
  taper: number; //        multiplier applied to points above the soft cap
}

export const DEFAULT_SCORING: ScoringConfig = {
  weightNew: 1,
  weightMaturing: 1.5,
  weightMature: 2.5,
  maturingDays: 7,
  matureDays: 21,
  dailySoftCap: 40,
  taper: 0.25,
};

function difficultyWeight(interval: number, c: ScoringConfig): number {
  if (interval >= c.matureDays) return c.weightMature;
  if (interval >= c.maturingDays) return c.weightMaturing;
  return c.weightNew;
}

export function proofOfStudyPoints(
  decks: Deck[],
  events: ReviewEvent[],
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  const interval = new Map<string, number>();
  for (const d of decks) for (const c of d.cards) interval.set(c.id, c.schedule.interval);

  // Sum weighted correct points per day…
  const perDay = new Map<string, number>();
  for (const e of events) {
    if (!e.correct) continue;
    const w = difficultyWeight(interval.get(e.cardId) ?? 0, config);
    const k = dayKey(e.at);
    perDay.set(k, (perDay.get(k) ?? 0) + w);
  }

  // …then apply diminishing returns beyond the daily soft cap.
  let total = 0;
  for (const raw of perDay.values()) {
    total +=
      raw <= config.dailySoftCap
        ? raw
        : config.dailySoftCap + (raw - config.dailySoftCap) * config.taper;
  }
  return Math.round(total);
}

/* ─── the bundle ───────────────────────────────────────────────────────────*/

export interface ReputationAxes {
  /** Padronanza, 0..100. */
  mastery: number;
  /** Progresso, 0..100 (50 = stable). */
  progress: number;
  /** Proof-of-study points (rate-limited, difficulty-weighted). */
  effort: number;
}

/** The full Fase-0 reputation for one learner. */
export function reputation(
  decks: Deck[],
  events: ReviewEvent[],
  now: number = Date.now(),
): ReputationAxes {
  return {
    mastery: mastery(decks, events, now),
    progress: progress(events, now),
    effort: proofOfStudyPoints(decks, events),
  };
}
