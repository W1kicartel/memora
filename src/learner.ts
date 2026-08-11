/**
 * learner.ts — the adaptive layer: answers get better the more you study.
 *
 * No servers, no training runs, no user data leaving the machine: the app
 * distills the user's OWN review history (which decks they fail, where they
 * excel, what they're focusing on) into a compact "learner profile" that is
 * appended to every study-engine system prompt. The model — local Ollama or
 * Claude alike — then calibrates its output: stronger mnemonics and more
 * worked examples on weak topics, more depth where the basics are solid.
 *
 * Pure analysis + a tiny cache. Tested in learner.test.ts.
 */

import type { Deck, ReviewEvent } from "./types";

/* ─── analysis ────────────────────────────────────────────────────────────── */

export interface DeckStat {
  name: string;
  reviews: number;
  accuracy: number; // 0..1
}

export interface LearnerInsights {
  totalReviews: number;
  accuracy: number | null;
  /** worst-performing decks (min 10 reviews, accuracy < 70%), worst first. */
  weak: DeckStat[];
  /** best decks (min 10 reviews, accuracy ≥ 85%), best first. */
  strong: DeckStat[];
  /** deck names most reviewed in the last 14 days. */
  recentFocus: string[];
}

const MIN_TOTAL = 20;      // below this the profile stays silent — not enough signal
const MIN_PER_DECK = 10;
const WEAK_BELOW = 0.7;
const STRONG_FROM = 0.85;
const RECENT_MS = 14 * 86_400_000;

export function analyzeLearner(
  decks: Deck[],
  events: ReviewEvent[],
  now: number = Date.now(),
): LearnerInsights {
  const byDeck = new Map<string, { ok: number; n: number }>();
  for (const e of events) {
    const s = byDeck.get(e.deckId) ?? { ok: 0, n: 0 };
    s.n++;
    if (e.correct) s.ok++;
    byDeck.set(e.deckId, s);
  }
  const nameOf = (id: string) => decks.find((d) => d.id === id)?.name ?? null;

  const stats: DeckStat[] = [...byDeck].flatMap(([id, s]) => {
    const name = nameOf(id);
    return name && s.n >= MIN_PER_DECK
      ? [{ name, reviews: s.n, accuracy: s.ok / s.n }]
      : [];
  });

  const weak = stats
    .filter((s) => s.accuracy < WEAK_BELOW)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);
  const strong = stats
    .filter((s) => s.accuracy >= STRONG_FROM)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 2);

  const cutoff = now - RECENT_MS;
  const recentCount = new Map<string, number>();
  for (const e of events) {
    if (e.at < cutoff) continue;
    const name = nameOf(e.deckId);
    if (name) recentCount.set(name, (recentCount.get(name) ?? 0) + 1);
  }
  const recentFocus = [...recentCount]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const total = events.length;
  return {
    totalReviews: total,
    accuracy: total ? events.filter((e) => e.correct).length / total : null,
    weak,
    strong,
    recentFocus,
  };
}

/** Render the insights as a system-prompt fragment ("" when signal is thin). */
export function learnerDirectiveFrom(ins: LearnerInsights): string {
  if (ins.totalReviews < MIN_TOTAL || ins.accuracy === null) return "";
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const deckList = (list: DeckStat[]) =>
    list.map((s) => `«${s.name}» (${pct(s.accuracy)} su ${s.reviews} ripassi)`).join(", ");

  const lines = [
    "PROFILO DELLO STUDENTE (calcolato in locale dal suo storico di ripassi — usalo per calibrare il materiale; menzionalo solo quando aiuta):",
    `- ${ins.totalReviews} ripassi totali, accuratezza complessiva ${pct(ins.accuracy)}.`,
  ];
  if (ins.weak.length) {
    lines.push(`- Punti deboli: ${deckList(ins.weak)}. Quando il contenuto tocca questi argomenti: più esempi svolti, distinzioni fini esplicite, agganci mnemonici più forti e domande applicative.`);
  }
  if (ins.strong.length) {
    lines.push(`- Punti di forza: ${deckList(ins.strong)}. Qui evita di ripetere le basi: vai in profondità.`);
  }
  if (ins.recentFocus.length) {
    lines.push(`- Focus recente: ${ins.recentFocus.join(", ")}. Collega il nuovo materiale a questi argomenti quando pertinente.`);
  }
  return lines.join("\n");
}

/* ─── live profile (cache + persistence) ─────────────────────────────────── */

const KEY = "memora:learner:v1";
let cached: string | null = null;

/** Recompute and persist the profile — App calls this when study data changes. */
export function updateLearnerProfile(decks: Deck[], events: ReviewEvent[]): void {
  cached = learnerDirectiveFrom(analyzeLearner(decks, events));
  try { localStorage.setItem(KEY, cached); } catch { /* storage unavailable */ }
}

/** Current profile fragment for prompt builders ("" when none). */
export function learnerDirective(): string {
  if (cached !== null) return cached;
  try { cached = localStorage.getItem(KEY) ?? ""; } catch { cached = ""; }
  return cached;
}
