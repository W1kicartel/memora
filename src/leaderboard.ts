/**
 * leaderboard.ts — the group's monthly study competition.
 *
 * Design choice (deliberate): the ranking is NOT live. During the month each
 * member only sees their own numbers; the standings are revealed when the
 * month closes. A live ranking lets the leader coast and demoralizes the
 * chasers — a sealed envelope keeps everyone honest until the 1st.
 *
 * Cross-subject by construction: points come from *studying* (reviews,
 * pomodoro focus, good habits), never from *what* is studied — so a law
 * student and a biology student compete on effort, the only fair axis.
 *
 * Pure logic, no React. Tested in leaderboard.test.ts.
 */

import type { ReviewEvent } from "./types";
import { POINTS_PER, HABIT_LIBRARY, dayStr, type LifeState } from "./life";
import type { MemberMonthly } from "./workgroup";

/* ─── month keys ──────────────────────────────────────────────────────────── */

/** "YYYY-MM" of a timestamp, local time. */
export function monthKeyOf(ms: number): string {
  return dayStr(ms).slice(0, 7);
}

/** The month before a "YYYY-MM" key. */
export function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/* ─── one member's numbers for one month ─────────────────────────────────── */

export interface MonthlyNumbers {
  points: number;
  activeDays: number;
}

/**
 * Compute this device's study numbers for a month, from the same sources the
 * rewards economy uses (life.ts POINTS_PER — one currency everywhere):
 * reviews, pomodoro minutes and checked build habits. Active days count
 * distinct days with real study activity (a review or a focus session);
 * habits alone don't make a day "active".
 */
export function computeMonthly(events: ReviewEvent[], life: LifeState, month: string): MonthlyNumbers {
  let points = 0;
  const studyDays = new Set<string>();

  for (const e of events) {
    const day = dayStr(e.at);
    if (day.slice(0, 7) !== month) continue;
    points += e.correct ? POINTS_PER.cardCorrect : POINTS_PER.cardIncorrect;
    studyDays.add(day);
  }

  for (const s of life.pomodoroSessions) {
    const day = dayStr(s.at);
    if (day.slice(0, 7) !== month) continue;
    points += s.minutes * POINTS_PER.pomodoroMin;
    studyDays.add(day);
  }

  for (const [day, ids] of Object.entries(life.checks)) {
    if (day.slice(0, 7) !== month) continue;
    for (const id of ids) {
      if (HABIT_LIBRARY.find((h) => h.id === id)?.type === "build") points += POINTS_PER.buildHabit;
    }
  }

  return { points, activeDays: studyDays.size };
}

/* ─── rankings ────────────────────────────────────────────────────────────── */

/** Entries for one month, ranked by points (chi ha studiato di più). */
export function rankByPoints(stats: MemberMonthly[], month: string): MemberMonthly[] {
  return stats
    .filter((s) => s.month === month)
    .sort((a, b) => b.points - a.points || b.activeDays - a.activeDays || a.name.localeCompare(b.name));
}

/** Entries for one month, ranked by constancy (chi è stato più costante). */
export function rankByConstancy(stats: MemberMonthly[], month: string): MemberMonthly[] {
  return stats
    .filter((s) => s.month === month)
    .sort((a, b) => b.activeDays - a.activeDays || b.points - a.points || a.name.localeCompare(b.name));
}

export const MEDALS = ["🥇", "🥈", "🥉"];
