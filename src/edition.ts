/**
 * edition.ts — build-time edition flag.
 *
 * Memora ships in two editions from this one codebase:
 *
 *   • PRIVATE (default) — the gift: song dedications, romantic rewards.
 *   • SOCIAL — the same study workspace for friends: identical decks,
 *     dashboard, groups (fully interoperable invite links) and AI, but
 *     without the dedications and the rewards shop.
 *
 * The flag is baked in by Vite: `vite build --mode social` loads
 * `.env.social`, which sets VITE_EDITION=social. Dead branches are
 * tree-shaken out of the social bundle entirely.
 */

export const IS_SOCIAL = import.meta.env.VITE_EDITION === "social";

/**
 * HAS_GIFT — the gift layer on top of the study workspace: the song of the
 * day with its dedications, the rewards shop and the points that feed it, the
 * note pinned to the hero and the hearts scattered around.
 *
 * It rides with the private edition and stays out of the social one, which
 * has never had it. It was briefly switched off for the private build too;
 * it is back on. Nothing was ever deleted, which is why turning it back on
 * is this one line.
 */
export const HAS_GIFT = !IS_SOCIAL;

/** One brand for both editions: the app is Memora, full stop. "Social" is
 *  only the internal edition name (build configs, update channel). */
export const APP_NAME = "Memora";
