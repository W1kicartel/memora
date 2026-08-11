/**
 * SM-2 spaced-repetition scheduling algorithm (SuperMemo 2).
 *
 * This is the pure, framework-agnostic core of the app. It contains no React,
 * no DOM and no I/O, which makes it trivial to unit-test (see sm2.test.ts) and
 * reuse anywhere. Given a card's current learning state and the quality of the
 * user's recall, it returns the *next* state: how many days until the card
 * should be shown again, the updated ease factor and the repetition count.
 *
 * Reference: P.A. Wozniak, "Optimization of repetition spacing in the practice
 * of learning" — the SM-2 formula.
 */

/** Recall grade given by the learner, 0 (total blackout) .. 5 (perfect). */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** The mutable learning state SM-2 tracks per card. */
export interface ReviewState {
  /** Number of consecutive correct (quality >= 3) reviews. */
  repetitions: number;
  /** Ease factor — how "easy" the card is. Never below 1.3. Starts at 2.5. */
  easeFactor: number;
  /** Current inter-repetition interval, in days. */
  interval: number;
}

/** The state a brand-new, never-reviewed card starts from. */
export const INITIAL_STATE: ReviewState = {
  repetitions: 0,
  easeFactor: 2.5,
  interval: 0,
};

const MIN_EASE_FACTOR = 1.3;
const PASS_THRESHOLD = 3; // quality >= 3 counts as a successful recall

/**
 * Update the ease factor from the answer quality.
 *
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), clamped to >= 1.3.
 * A perfect answer (q = 5) nudges EF up by 0.1; weaker answers reduce it.
 */
function nextEaseFactor(easeFactor: number, quality: Quality): number {
  const q = quality;
  const updated =
    easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(MIN_EASE_FACTOR, updated);
}

/**
 * Apply one review to a card and return its next scheduling state.
 *
 * Pure function: it does not mutate `state`.
 *
 * - quality < 3  -> the card lapsed: repetitions reset to 0 and the interval
 *   drops back to 1 day, but the (reduced) ease factor is kept.
 * - quality >= 3 -> repetition 1 schedules +1 day, repetition 2 schedules
 *   +6 days, and every later repetition multiplies the previous interval by
 *   the ease factor (rounded).
 *
 * @throws RangeError if quality is not an integer in 0..5.
 */
export function review(state: ReviewState, quality: Quality): ReviewState {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError(`quality must be an integer 0..5, got ${quality}`);
  }

  const easeFactor = nextEaseFactor(state.easeFactor, quality);

  // A lapse: restart the learning steps but keep the adjusted ease factor.
  if (quality < PASS_THRESHOLD) {
    return { repetitions: 0, easeFactor, interval: 1 };
  }

  const repetitions = state.repetitions + 1;
  let interval: number;
  if (repetitions === 1) {
    interval = 1;
  } else if (repetitions === 2) {
    interval = 6;
  } else {
    interval = Math.round(state.interval * easeFactor);
  }

  return { repetitions, easeFactor, interval };
}

/**
 * Compute the next due timestamp (ms since epoch) after a review made `now`.
 * The interval (days) is added as whole days.
 */
export function nextDueDate(
  state: ReviewState,
  now: number = Date.now()
): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return now + state.interval * MS_PER_DAY;
}

/** True if a card with this due timestamp should be studied at `now`. */
export function isDue(dueDate: number, now: number = Date.now()): boolean {
  return dueDate <= now;
}
