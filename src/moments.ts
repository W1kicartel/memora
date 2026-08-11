/**
 * moments.ts — the "notable moments" detector.
 *
 * A pure, fully-tested reading of the review event log that surfaces ONLY the
 * moments worth remembering — streak milestones, comebacks, personal bests,
 * hot streaks, volume milestones and the occasional hard-earned setback — and
 * deliberately ignores the everyday noise (a handful of reviews, opening the
 * app). It is the editorial filter behind two features:
 *
 *   • the group "Diario di Bordo" — a private, self-writing logbook, and
 *   • the achievement triggers that feed reputation (see score.ts).
 *
 * Detection is a pure function of the event log, so it is reconstructable and
 * LANGUAGE-AGNOSTIC: it emits structured FACTS. Turning a Moment into prose
 * (the Italian copy, or an AI-narrated digest) is a separate layer — see
 * describeMoment() for the rule-based default.
 *
 * No React, no DOM, no I/O. Tested in moments.test.ts.
 */
import type { ReviewEvent } from "./types";
import { dayKey } from "./stats";

const MS_PER_DAY = 86_400_000;

/** Emotional register of a moment — drives how the diary frames it. */
export type MomentTone =
  | "triumph" // a win to celebrate
  | "grit" //    resilience — coming back after a break
  | "setback"; // a notable stumble, framed with compassion

export type MomentKind =
  | "streak-milestone" //  reached N consecutive study days
  | "comeback" //          resumed studying after a break that ended a real streak
  | "streak-lost" //       a long streak ended (a *clamorous* failure, not the everyday)
  | "personal-best-day" // most reviews in a single day so far
  | "hot-streak" //        N correct answers in a row
  | "volume-milestone"; // crossed a cumulative-reviews threshold

/**
 * One noteworthy moment. `value` is the salient magnitude (streak length,
 * review count, run length…). `at` is when it actually happened.
 */
export interface Moment {
  at: number;
  kind: MomentKind;
  tone: MomentTone;
  value: number;
}

/** Thresholds that define what counts as "noteworthy". Tune to taste. */
export interface MomentConfig {
  /** Consecutive study days worth announcing. */
  streakMilestones: number[];
  /** A broken run at least this long counts as a "comeback" on return. */
  comebackMinStreak: number;
  /** Losing a run at least this long is a *notable* setback (the rest is noise). */
  setbackMinStreak: number;
  /** Consecutive correct answers worth announcing. */
  hotStreakMilestones: number[];
  /** Cumulative-review counts worth announcing. */
  volumeMilestones: number[];
  /** Ignore "records" below this daily volume — avoids trumpeting a slow day. */
  personalBestFloor: number;
}

export const DEFAULT_MOMENT_CONFIG: MomentConfig = {
  streakMilestones: [7, 30, 100, 365],
  comebackMinStreak: 7,
  setbackMinStreak: 30,
  hotStreakMilestones: [20, 50, 100],
  volumeMilestones: [100, 500, 1000, 5000],
  personalBestFloor: 10,
};

/** Local noon of a YYYY-MM-DD day — stable under DST, matches stats.ts bucketing. */
function dayToLocalNoon(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/** True if `day` is the calendar day right after `prevDay`. */
function isNextDay(prevDay: string, day: string): boolean {
  return dayKey(dayToLocalNoon(prevDay) + MS_PER_DAY) === day;
}

/**
 * Scan the event log and return every notable moment, oldest first.
 *
 * Pure function of the events (and `now`, to judge whether a trailing streak is
 * still alive). Everyday activity produces NO moments — that is the point.
 */
export function detectMoments(
  events: ReviewEvent[],
  now: number = Date.now(),
  config: MomentConfig = DEFAULT_MOMENT_CONFIG,
): Moment[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.at - b.at);
  const out: Moment[] = [];

  // ── event-level pass: cumulative volume + consecutive-correct hot streaks ──
  const volumes = new Set(config.volumeMilestones);
  const hotMarks = new Set(config.hotStreakMilestones);
  let cumulative = 0;
  let correctRun = 0;
  for (const e of sorted) {
    cumulative++;
    if (volumes.has(cumulative)) {
      out.push({ at: e.at, kind: "volume-milestone", tone: "triumph", value: cumulative });
    }
    if (e.correct) {
      correctRun++;
      if (hotMarks.has(correctRun)) {
        out.push({ at: e.at, kind: "hot-streak", tone: "triumph", value: correctRun });
      }
    } else {
      correctRun = 0;
    }
  }

  // ── day-level aggregation ──
  const byDay = new Map<string, { count: number; lastAt: number }>();
  for (const e of sorted) {
    const k = dayKey(e.at);
    const slot = byDay.get(k);
    if (slot) {
      slot.count++;
      if (e.at > slot.lastAt) slot.lastAt = e.at;
    } else {
      byDay.set(k, { count: 1, lastAt: e.at });
    }
  }
  const days = [...byDay.keys()].sort(); // YYYY-MM-DD sorts chronologically

  // ── personal-best days: a record must beat a previous (non-zero) best ──
  let prevBest = 0;
  for (const day of days) {
    const { count, lastAt } = byDay.get(day)!;
    if (count >= config.personalBestFloor && count > prevBest && prevBest > 0) {
      out.push({ at: lastAt, kind: "personal-best-day", tone: "triumph", value: count });
    }
    if (count > prevBest) prevBest = count;
  }

  // ── streak walk: milestones, comebacks and lost streaks ──
  const streakMarks = new Set(config.streakMilestones);
  let run = 0;
  let prevDay: string | null = null;
  for (const day of days) {
    const { lastAt } = byDay.get(day)!;
    if (prevDay !== null && isNextDay(prevDay, day)) {
      run++;
    } else {
      if (prevDay !== null) {
        // a gap ended the previous run of length `run`
        const brokenAt = byDay.get(prevDay)!.lastAt;
        if (run >= config.setbackMinStreak) {
          out.push({ at: brokenAt, kind: "streak-lost", tone: "setback", value: run });
        }
        if (run >= config.comebackMinStreak) {
          out.push({ at: lastAt, kind: "comeback", tone: "grit", value: run });
        }
      }
      run = 1;
    }
    if (streakMarks.has(run)) {
      out.push({ at: lastAt, kind: "streak-milestone", tone: "triumph", value: run });
    }
    prevDay = day;
  }

  // ── trailing streak lost at the end of the log (no resumption) ──
  if (prevDay !== null && run >= config.setbackMinStreak) {
    const today = dayKey(now);
    const yesterday = dayKey(now - MS_PER_DAY);
    const alive = prevDay === today || prevDay === yesterday;
    if (!alive) {
      out.push({ at: byDay.get(prevDay)!.lastAt, kind: "streak-lost", tone: "setback", value: run });
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

/**
 * Narrate a moment. Pass a translator `t` (from i18n) to localise it — keys are
 * `moment.<kind>` with a `{value}` param. With no `t`, falls back to the
 * built-in Italian voice (also what the tests assert against). An AI-narrated
 * digest can replace either layer later without touching detection.
 */
export function describeMoment(
  m: Moment,
  t?: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (t) return t(`moment.${m.kind}`, { value: m.value });
  switch (m.kind) {
    case "streak-milestone":
      return `🔥 ${m.value} giorni di studio di fila!`;
    case "comeback":
      return `💪 Bentornato allo studio: una striscia di ${m.value} giorni riaccesa dopo lo stop.`;
    case "streak-lost":
      return `🌧️ Interrotta una striscia di ${m.value} giorni. Capita ai migliori — si riparte.`;
    case "personal-best-day":
      return `🚀 Record personale: ${m.value} ripassi in un giorno.`;
    case "hot-streak":
      return `🎯 ${m.value} risposte corrette di fila.`;
    case "volume-milestone":
      return `📚 ${m.value} ripassi totali raggiunti.`;
  }
}
