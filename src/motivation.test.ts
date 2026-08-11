/**
 * Dependency-free tests for the motivational phrases.
 * Run with:  npx tsx src/motivation.test.ts
 */
import {
  FACULTIES, GENERIC_PHRASES, FACULTY_PHRASES, dailyPhrase, sessionPhrase,
} from "./motivation";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

// --- bank sanity -------------------------------------------------------------
{
  const all = [...GENERIC_PHRASES, ...Object.values(FACULTY_PHRASES).flat()];
  assert(all.every((p) => p.trim().length > 0), "no empty phrases");
  assert(new Set(all).size === all.length, "no duplicate phrases");
  assert(GENERIC_PHRASES.some((p) => p.includes("Non sei i tuoi voti")), "the requested phrase is in the bank");
  const facultyIds = FACULTIES.map((f) => f.id);
  assert(
    Object.keys(FACULTY_PHRASES).every((k) => facultyIds.includes(k)),
    "every themed pool matches a questionnaire option",
  );
  assert(facultyIds.includes("altro"), "questionnaire has an 'altro' escape hatch");
}

// --- dailyPhrase -------------------------------------------------------------
{
  const noon = new Date("2026-08-11T12:00:00").getTime();
  const night = new Date("2026-08-11T23:59:00").getTime();
  const tomorrow = new Date("2026-08-12T08:00:00").getTime();
  assert(dailyPhrase("medicina", noon) === dailyPhrase("medicina", night), "stable within the same day");
  const changes = [1, 2, 3, 4, 5].some(
    (d) => dailyPhrase("medicina", noon + d * 86_400_000) !== dailyPhrase("medicina", noon),
  );
  assert(changes, "rotates across days");
  const pool = [...GENERIC_PHRASES, ...FACULTY_PHRASES.medicina];
  assert(pool.includes(dailyPhrase("medicina", noon)), "daily phrase comes from the right pool");
  assert(GENERIC_PHRASES.includes(dailyPhrase(undefined, noon)), "no faculty → generic pool only");
  assert(GENERIC_PHRASES.includes(dailyPhrase("inesistente", noon)), "unknown faculty falls back to generic");
}

// --- sessionPhrase -----------------------------------------------------------
{
  assert(FACULTY_PHRASES.giurisprudenza.includes(sessionPhrase("giurisprudenza", 0.1)), "low rand → themed phrase");
  assert(GENERIC_PHRASES.includes(sessionPhrase("giurisprudenza", 0.9)), "high rand → generic phrase");
  assert(GENERIC_PHRASES.includes(sessionPhrase(undefined, 0.1)), "no faculty → always generic");
  // Rand edges never go out of bounds.
  assert(typeof sessionPhrase("lingue", 0) === "string" && typeof sessionPhrase("lingue", 0.9999) === "string",
    "edge rand values stay in bounds");
}

console.log(`\nMotivation tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
