/**
 * "Student life" features: a Pomodoro timer, quick notes, a habit + mood
 * tracker, and a budget tracker. This module is the self-contained, pure core
 * (types, constants, persistence, and tested aggregation helpers); the UI lives
 * in lifeview.tsx. No React here.
 */

import type { ReviewEvent } from "./types";

/* ------------------------------- types --------------------------------- */

export type HabitType = "build" | "quit";

export interface Habit {
  id: string;
  name: string;
  icon: string; // emoji
  type: HabitType;
}

export interface Note {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
}

export interface MoodLog {
  date: string; // YYYY-MM-DD
  mood: number; // 1..5
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  note: string;
}

export interface PomodoroSession {
  at: number;
  minutes: number;
}

export interface LifeState {
  settings: { monthlyBudget: number; focusMin: number; breakMin: number };
  /** Active habit ids the student is tracking. */
  habits: string[];
  /** habit completions: date -> habit ids done that day. */
  checks: Record<string, string[]>;
  notes: Note[];
  moodLogs: MoodLog[];
  expenses: Expense[];
  pomodoroSessions: PomodoroSession[];
  /** Points accumulated from the app being open (3h blocks). */
  passivePoints: number;
  /** Timestamp of the last passive-points grant. */
  lastPassiveAt: number;
  /** Reward ids the user has redeemed (deducted from total). */
  redeemedRewards: string[];
}

/* ─── study levels ───────────────────────────────────────────────────────── */

export interface StudyLevel {
  level: number;
  name: string;
  minPts: number;
  color: string;
}

export const STUDY_LEVELS: StudyLevel[] = [
  { level: 1, name: "Scintilla",  minPts: 0,      color: "#9a9a9a" },
  { level: 2, name: "Fiamma",     minPts: 500,    color: "#4ade80" },
  { level: 3, name: "Astro",      minPts: 1500,   color: "#22c55e" },
  { level: 4, name: "Cometa",     minPts: 4000,   color: "#16a34a" },
  { level: 5, name: "Stella",     minPts: 9000,   color: "#7b85dc" },
  { level: 6, name: "Supernova",  minPts: 20000,  color: "#5e6ad2" },
  { level: 7, name: "Galassia",   minPts: 45000,  color: "#a78bfa" },
  { level: 8, name: "Cosmo",      minPts: 100000, color: "#fbbf24" },
];

export function computeLevel(points: number): {
  current: StudyLevel;
  next: StudyLevel | null;
  pct: number;
} {
  let idx = 0;
  for (let i = STUDY_LEVELS.length - 1; i >= 0; i--) {
    if (points >= STUDY_LEVELS[i].minPts) { idx = i; break; }
  }
  const current = STUDY_LEVELS[idx];
  const next = STUDY_LEVELS[idx + 1] ?? null;
  const pct = next ? (points - current.minPts) / (next.minPts - current.minPts) : 1;
  return { current, next, pct };
}

/* ─── rewards ────────────────────────────────────────────────────────────── */

export type RewardTier = "small" | "medium" | "big" | "dream";

export interface Reward {
  id: string;
  name: string;
  desc: string;
  cost: number;
  tier: RewardTier;
  requiredLevel?: number;
}

/**
 * Buoni romantici: ogni premio è una promessa da riscattare insieme.
 * The dream trip costs ~500h of focused Pomodoro sessions at 1pt/min.
 */
export const REWARDS: Reward[] = [
  { id: "gelato",   name: "Gelato insieme",       desc: "Due gusti, una passeggiata, nessuna fretta.",              cost: 200,   tier: "small",  requiredLevel: 1 },
  { id: "movie",    name: "Serata film",          desc: "Coperte, popcorn — il film lo scegli tu.",                 cost: 450,   tier: "small",  requiredLevel: 1 },
  { id: "picnic",   name: "Picnic al tramonto",   desc: "Una coperta, un cestino e la luce dorata.",                cost: 900,   tier: "medium", requiredLevel: 2 },
  { id: "dinner",   name: "Cena per due",         desc: "Un tavolo, due sedie. Il posto lo scegli tu.",             cost: 2000,  tier: "medium", requiredLevel: 3 },
  { id: "spa",      name: "Giornata alle terme",  desc: "Relax totale — ogni minuto te lo sei guadagnata.",         cost: 4500,  tier: "big",    requiredLevel: 4 },
  { id: "daytrip",  name: "Fuga di un giorno",    desc: "Una meta a tua scelta, telefoni in tasca. Solo noi.",      cost: 9000,  tier: "big",    requiredLevel: 5 },
  { id: "weekend",  name: "Weekend altrove",      desc: "Due giorni interi in un posto nuovo, insieme.",            cost: 18000, tier: "big",    requiredLevel: 6 },
  { id: "trip",     name: "Il viaggio",           desc: "500 ore di vero focus. Ti porto davvero in viaggio.",      cost: 36000, tier: "dream",  requiredLevel: 7 },
];

/* ─── points config ──────────────────────────────────────────────────────── */

export const POINTS_PER = {
  pomodoroMin:    1,   // 1 pt per minute of focus (25 min → 25 pts)
  cardCorrect:    3,
  cardIncorrect:  1,
  buildHabit:     5,   // positive habits checked
  passiveBlock:   50,  // earned every PASSIVE_INTERVAL_MS the app is open
};

/** 3 hours — passive points interval */
export const PASSIVE_INTERVAL_MS = 3 * 60 * 60 * 1000;

/**
 * Lifetime points earned from all activity. This number never decreases, and
 * it is what drives the study LEVEL: redeeming a reward spends the balance,
 * never the career — a level, once reached, is yours.
 */
export function computeEarnedPoints(events: ReviewEvent[], life: LifeState): number {
  let pts = 0;

  for (const e of events) {
    pts += e.correct ? POINTS_PER.cardCorrect : POINTS_PER.cardIncorrect;
  }

  for (const s of life.pomodoroSessions) {
    pts += s.minutes * POINTS_PER.pomodoroMin;
  }

  for (const checks of Object.values(life.checks)) {
    for (const hid of checks) {
      const h = HABIT_LIBRARY.find((x) => x.id === hid);
      if (h?.type === "build") pts += POINTS_PER.buildHabit;
      // quit habits give 0 pts when checked (marking you did the bad thing)
    }
  }

  pts += life.passivePoints;
  return pts;
}

/** Spendable balance: lifetime earnings minus the cost of redeemed rewards. */
export function computePoints(events: ReviewEvent[], life: LifeState): number {
  let pts = computeEarnedPoints(events, life);

  for (const rid of life.redeemedRewards) {
    const r = REWARDS.find((x) => x.id === rid);
    if (r) pts -= r.cost;
  }

  return Math.max(0, pts);
}

/* ----------------------------- constants ------------------------------- */

export const HABIT_LIBRARY: Habit[] = [
  { id: "water", name: "Water", icon: "💧", type: "build" },
  { id: "sleep", name: "Sleep 7h+", icon: "😴", type: "build" },
  { id: "move", name: "Movement", icon: "🏃", type: "build" },
  { id: "study", name: "Focused study", icon: "🎯", type: "build" },
  { id: "readbook", name: "Reading", icon: "📖", type: "build" },
  { id: "meals", name: "Regular meals", icon: "🥗", type: "build" },
  { id: "outside", name: "Time outside", icon: "☀️", type: "build" },
  { id: "breath", name: "Meditation", icon: "🧘", type: "build" },
  { id: "smoke", name: "Smoking", icon: "🚬", type: "quit" },
  { id: "scroll", name: "Doomscrolling", icon: "📱", type: "quit" },
  { id: "junk", name: "Junk food", icon: "🍬", type: "quit" },
  { id: "spend", name: "Impulse spending", icon: "💳", type: "quit" },
  { id: "procrastinate", name: "Procrastination", icon: "⏳", type: "quit" },
  { id: "gaming", name: "Late-night gaming", icon: "🎮", type: "quit" },
];

export const DEFAULT_ACTIVE_HABITS = ["water", "sleep", "move", "study"];

export const MOODS = [
  { v: 1, label: "Awful", emoji: "😞", color: "#ea4335" },
  { v: 2, label: "Meh", emoji: "😕", color: "#f59e0b" },
  { v: 3, label: "OK", emoji: "😐", color: "#9aa0b0" },
  { v: 4, label: "Good", emoji: "🙂", color: "#4285f4" },
  { v: 5, label: "Great", emoji: "😄", color: "#34a853" },
];

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Food",
  "Transport",
  "Books/Supplies",
  "Going out",
  "Other",
];

export function defaultLife(): LifeState {
  return {
    settings: { monthlyBudget: 600, focusMin: 25, breakMin: 5 },
    habits: [...DEFAULT_ACTIVE_HABITS],
    checks: {},
    notes: [],
    moodLogs: [],
    expenses: [],
    pomodoroSessions: [],
    passivePoints: 0,
    lastPassiveAt: Date.now(),
    redeemedRewards: [],
  };
}

/* ----------------------------- persistence ----------------------------- */

const KEY = "memora:life:v1";

export function loadLife(): LifeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultLife();
    return { ...defaultLife(), ...(JSON.parse(raw) as Partial<LifeState>) } as LifeState;
  } catch {
    return defaultLife();
  }
}

export function saveLife(state: LifeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* --------------------------- pure helpers ------------------------------ */

const MS_PER_DAY = 86_400_000;

export function dayStr(ms: number = Date.now()): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export interface BudgetSummary {
  spent: number;
  budget: number;
  remaining: number;
  byCategory: { category: string; amount: number }[];
}

/** Spending for the current month, remaining budget, and per-category totals. */
export function budgetSummary(
  expenses: Expense[],
  monthlyBudget: number,
  now: number = Date.now()
): BudgetSummary {
  const mk = monthKey(dayStr(now));
  const month = expenses.filter((e) => monthKey(e.date) === mk);
  const spent = month.reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<string, number>();
  for (const e of month) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  return {
    spent,
    budget: monthlyBudget,
    remaining: monthlyBudget - spent,
    byCategory: [...byCat.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/**
 * Current streak for a habit. For "build" habits a day counts when it's checked;
 * for "quit" habits a day counts when it's checked (= stayed clean). Counts
 * consecutive days ending today, or yesterday if today isn't logged yet.
 */
export function habitStreak(
  checks: Record<string, string[]>,
  habitId: string,
  now: number = Date.now()
): number {
  const done = (ms: number) => (checks[dayStr(ms)] ?? []).includes(habitId);
  let streak = 0;
  let cursor = done(now) ? now : now - MS_PER_DAY;
  while (done(cursor)) {
    streak++;
    cursor -= MS_PER_DAY;
  }
  return streak;
}

/** Pomodoro focus sessions + minutes completed today. */
export function pomodoroToday(
  sessions: PomodoroSession[],
  now: number = Date.now()
): { count: number; minutes: number } {
  const today = dayStr(now);
  const todays = sessions.filter((s) => dayStr(s.at) === today);
  return {
    count: todays.length,
    minutes: todays.reduce((sum, s) => sum + s.minutes, 0),
  };
}

/** Average mood over the trailing `windowDays` (null if none logged). */
export function averageMood(
  logs: MoodLog[],
  now: number = Date.now(),
  windowDays = 7
): number | null {
  const cutoff = dayStr(now - (windowDays - 1) * MS_PER_DAY);
  const recent = logs.filter((l) => l.date >= cutoff);
  if (recent.length === 0) return null;
  return recent.reduce((s, l) => s + l.mood, 0) / recent.length;
}
