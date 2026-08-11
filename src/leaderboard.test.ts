/**
 * Dependency-free tests for the monthly leaderboard logic.
 * Run with:  npx tsx src/leaderboard.test.ts
 */
import {
  monthKeyOf, prevMonthKey, computeMonthly, rankByPoints, rankByConstancy,
} from "./leaderboard";
import { defaultLife, POINTS_PER } from "./life";
import { mergeGroups, createGroup, type Workgroup, type MemberMonthly, type Profile } from "./workgroup";
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

const ms = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime();

// --- month keys --------------------------------------------------------------
{
  assert(monthKeyOf(ms("2026-08-11")) === "2026-08", "monthKeyOf extracts YYYY-MM");
  assert(prevMonthKey("2026-08") === "2026-07", "prevMonthKey in-year");
  assert(prevMonthKey("2026-01") === "2025-12", "prevMonthKey rolls the year");
}

// --- computeMonthly ----------------------------------------------------------
{
  const events: ReviewEvent[] = [
    { at: ms("2026-08-03"), deckId: "d", cardId: "c1", quality: 5, correct: true },
    { at: ms("2026-08-03", 18), deckId: "d", cardId: "c2", quality: 2, correct: false },
    { at: ms("2026-08-10"), deckId: "d", cardId: "c3", quality: 4, correct: true },
    { at: ms("2026-07-28"), deckId: "d", cardId: "c4", quality: 4, correct: true }, // other month
  ];
  const life = defaultLife();
  life.pomodoroSessions = [
    { at: ms("2026-08-05"), minutes: 25 },
    { at: ms("2026-07-30"), minutes: 50 }, // other month
  ];
  life.checks = {
    "2026-08-03": ["water", "smoke"],   // build (+5) + quit (0)
    "2026-07-29": ["water"],            // other month
  };

  const m = computeMonthly(events, life, "2026-08");
  const expected =
    POINTS_PER.cardCorrect * 2 + POINTS_PER.cardIncorrect +
    25 * POINTS_PER.pomodoroMin + POINTS_PER.buildHabit;
  assert(m.points === expected, `august points add reviews+pomodoro+habits (got ${m.points}, want ${expected})`);
  assert(m.activeDays === 3, `active days = distinct study days (got ${m.activeDays}, want 3)`);

  const july = computeMonthly(events, life, "2026-07");
  assert(july.points === POINTS_PER.cardCorrect + 50 + POINTS_PER.buildHabit, "july counts only july");
  assert(july.activeDays === 2, "july active days");
}

// --- rankings ----------------------------------------------------------------
{
  const stats: MemberMonthly[] = [
    { memberId: "a", name: "Anna", month: "2026-07", points: 900, activeDays: 12, updatedAt: 1 },
    { memberId: "b", name: "Bea",  month: "2026-07", points: 1200, activeDays: 9, updatedAt: 1 },
    { memberId: "c", name: "Caterina", month: "2026-07", points: 900, activeDays: 20, updatedAt: 1 },
    { memberId: "d", name: "Dora", month: "2026-08", points: 5000, activeDays: 2, updatedAt: 1 }, // other month
  ];
  const pts = rankByPoints(stats, "2026-07");
  assert(pts.length === 3, "ranking filters by month");
  assert(pts[0].name === "Bea", "points ranking: most points first");
  assert(pts[1].name === "Caterina", "points tie broken by active days");
  const con = rankByConstancy(stats, "2026-07");
  assert(con[0].name === "Caterina", "constancy ranking: most active days first");
}

// --- stats merge (LWW per member+month) --------------------------------------
{
  const anna: Profile = { id: "u-anna", name: "Anna" };
  const g = createGroup("Con classifica", "", anna);
  g.stats!.push({ memberId: "u-anna", name: "Anna", month: "2026-08", points: 100, activeDays: 3, updatedAt: 10 });

  const other: Workgroup = JSON.parse(JSON.stringify(g));
  other.stats = [
    { memberId: "u-anna", name: "Anna", month: "2026-08", points: 250, activeDays: 5, updatedAt: 20 }, // newer
    { memberId: "u-luca", name: "Luca", month: "2026-08", points: 80, activeDays: 2, updatedAt: 5 },
  ];

  const m = mergeGroups(g, other);
  assert((m.stats ?? []).length === 2, "stats merge unions members");
  assert(m.stats!.find((s) => s.memberId === "u-anna")!.points === 250, "newer entry wins (LWW)");

  const back = mergeGroups(other, g); // stale incoming
  assert(back.stats!.find((s) => s.memberId === "u-anna")!.points === 250, "stale incoming does not regress");
}

// --- syncId propagation ------------------------------------------------------
{
  const anna: Profile = { id: "u-anna", name: "Anna" };
  const a = createGroup("Sync", "", anna);
  const b: Workgroup = JSON.parse(JSON.stringify(a));
  b.syncId = "abcdefghijklmnopqrstuvwxyz012345";
  assert(mergeGroups(a, b).syncId === b.syncId, "syncId adopted from incoming");
  const aWithId: Workgroup = { ...a, syncId: "localidlocalidlocalidlocalid1234" };
  assert(mergeGroups(aWithId, b).syncId === aWithId.syncId, "local syncId wins when both set");
}

console.log(`\nLeaderboard tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
