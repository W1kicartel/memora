/**
 * Dependency-free tests for the student-life helpers.
 * Run with:  npx tsx src/life.test.ts
 */
import {
  budgetSummary,
  habitStreak,
  pomodoroToday,
  averageMood,
  monthKey,
  dayStr,
  computePoints,
  computeEarnedPoints,
  computeLevel,
  defaultLife,
  REWARDS,
  type Expense,
  type PomodoroSession,
  type MoodLog,
} from "./life";
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

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();

// --- dayStr / monthKey -----------------------------------------------------
assert(dayStr(noon(2024, 3, 9)) === "2024-03-09", "dayStr formats date");
assert(monthKey("2024-03-09") === "2024-03", "monthKey takes YYYY-MM");

// --- budgetSummary ---------------------------------------------------------
{
  const now = noon(2024, 5, 15);
  const expenses: Expense[] = [
    { id: "1", date: "2024-05-01", amount: 400, category: "Rent", note: "" },
    { id: "2", date: "2024-05-10", amount: 50, category: "Food", note: "" },
    { id: "3", date: "2024-05-12", amount: 30, category: "Food", note: "" },
    { id: "4", date: "2024-04-30", amount: 999, category: "Other", note: "" }, // last month
  ];
  const b = budgetSummary(expenses, 600, now);
  assert(b.spent === 480, "only current month counts (400+50+30)");
  assert(b.remaining === 120, "remaining = budget - spent");
  assert(b.byCategory[0].category === "Rent" && b.byCategory[0].amount === 400, "categories sorted desc");
  assert(b.byCategory.find((c) => c.category === "Food")?.amount === 80, "food totals merged");
}

// --- habitStreak -----------------------------------------------------------
{
  const today = noon(2024, 6, 10);
  const ds = (ms: number) => dayStr(ms);
  const checks: Record<string, string[]> = {
    [ds(noon(2024, 6, 8))]: ["water"],
    [ds(noon(2024, 6, 9))]: ["water", "study"],
    [ds(noon(2024, 6, 10))]: ["water"],
  };
  assert(habitStreak(checks, "water", today) === 3, "water 3-day streak");
  // study done only on the 9th; today (10th) not done -> from yesterday: 9th yes, 8th no => 1
  assert(habitStreak(checks, "study", today) === 1, "study streak = 1 (grace day)");
}
{
  // not done today but done yesterday -> streak still counts (grace day)
  const today = noon(2024, 6, 10);
  const checks: Record<string, string[]> = {
    [dayStr(noon(2024, 6, 9))]: ["move"],
    [dayStr(noon(2024, 6, 8))]: ["move"],
  };
  assert(habitStreak(checks, "move", today) === 2, "grace day: streak up to yesterday");
}
assert(habitStreak({}, "x", noon(2024, 1, 1)) === 0, "no checks -> 0 streak");

// --- pomodoroToday ---------------------------------------------------------
{
  const now = noon(2024, 7, 1);
  const sessions: PomodoroSession[] = [
    { at: now, minutes: 25 },
    { at: now - 1000, minutes: 25 },
    { at: noon(2024, 6, 30), minutes: 25 }, // yesterday
  ];
  const p = pomodoroToday(sessions, now);
  assert(p.count === 2 && p.minutes === 50, "today: 2 sessions, 50 min");
}

// --- averageMood -----------------------------------------------------------
{
  const now = noon(2024, 8, 7);
  const logs: MoodLog[] = [
    { date: dayStr(noon(2024, 8, 7)), mood: 5 },
    { date: dayStr(noon(2024, 8, 6)), mood: 3 },
    { date: dayStr(noon(2024, 8, 1)), mood: 1 }, // outside 7-day window (window starts 8-01? inclusive)
  ];
  const avg = averageMood(logs, now, 3);
  assert(avg !== null && Math.abs(avg - 4) < 1e-9, "3-day mood average = (5+3)/2 = 4");
  assert(averageMood([], now) === null, "no logs -> null");
}

// --- points: career vs balance ---------------------------------------------
{
  const life = {
    ...defaultLife(),
    pomodoroSessions: [{ at: noon(2024, 5, 1), minutes: 500 }] as PomodoroSession[],
  };
  const events: ReviewEvent[] = [];

  const earnedBefore = computeEarnedPoints(events, life);
  const balanceBefore = computePoints(events, life);
  assert(earnedBefore === 500 && balanceBefore === 500, "500 focused minutes → 500 pts earned and spendable");

  const gelato = REWARDS.find((r) => r.id === "gelato")!;
  const afterRedeem = { ...life, redeemedRewards: ["gelato"] };
  assert(
    computePoints(events, afterRedeem) === 500 - gelato.cost,
    "redeeming spends the balance",
  );
  assert(
    computeEarnedPoints(events, afterRedeem) === earnedBefore,
    "redeeming NEVER touches career points",
  );
  assert(
    computeLevel(computeEarnedPoints(events, afterRedeem)).current.level ===
      computeLevel(earnedBefore).current.level,
    "the level survives a redemption",
  );

  // Balance can hit zero, but the career keeps every point ever earned.
  const bigSpender = { ...life, redeemedRewards: ["gelato", "movie"] };
  assert(computePoints(events, bigSpender) === 0, "balance clamps at zero");
  assert(computeEarnedPoints(events, bigSpender) === 500, "career unaffected by overspending");
}

console.log(`\nLife tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
