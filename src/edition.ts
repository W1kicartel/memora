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
 * It used to be simply `!IS_SOCIAL`. It is now its own switch, off, because
 * the private edition was asked to look exactly like the one everyone else
 * runs — same features, same screens — while keeping its own appId, userData
 * folder and update repo, so an existing install just receives it as a normal
 * update instead of a new installer.
 *
 * Nothing was deleted: every branch below this flag is still in the source.
 * Set it back to `!IS_SOCIAL` to bring the gift back exactly as it was.
 */
export const HAS_GIFT = false;

/** One brand for both editions: the app is Memora, full stop. "Social" is
 *  only the internal edition name (build configs, update channel). */
export const APP_NAME = "Memora";
