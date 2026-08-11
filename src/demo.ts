/**
 * demo.ts — a realistic sample study history, for DEVELOPMENT and first-run demos.
 *
 * The Reputation panel and the Diario di Bordo only come alive once there is a
 * few months of activity to read. This generates a believable arc — a long
 * streak, a stumble, a comeback, a record day — so the social layer can be seen
 * and screenshotted before a real user has built up that history.
 *
 * Pure and DETERMINISTIC (seeded), so results are reproducible. It is never
 * loaded automatically: the app offers it behind an explicit action.
 */
import type { Card, Deck, ReviewEvent } from "./types";
import { uid } from "./storage";

const DAY = 86_400_000;

/** Tiny seeded PRNG (mulberry32) — deterministic sample data. */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local noon `offset` days before `now` — a stable, DST-safe day anchor. */
function dayAt(now: number, offset: number): number {
  const d = new Date(now - offset * DAY);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

// Deck content (Italian, matching the study domain) with a per-card interval so
// some cards are already "mature" (>= 21d) — that is what makes effort weighty.
const DECK_SPECS: { name: string; cards: [string, string, number][] }[] = [
  {
    name: "Anatomia",
    cards: [
      ["Quante vertebre cervicali?", "Sette (C1–C7).", 34],
      ["Cos'è il nervo vago?", "Il decimo nervo cranico, parasimpatico.", 28],
      ["Origine del muscolo bicipite?", "Tuberosità sovraglenoidea e processo coracoideo.", 24],
      ["Cellule del pancreas endocrino?", "Isole di Langerhans: α, β, δ, PP.", 12],
      ["Cos'è la diafisi?", "Il corpo cilindrico di un osso lungo.", 6],
      ["Valvola tra atrio e ventricolo sinistro?", "Valvola mitrale (bicuspide).", 2],
    ],
  },
  {
    name: "Diritto Privato",
    cards: [
      ["Cos'è un negozio giuridico?", "Manifestazione di volontà diretta a effetti giuridici.", 30],
      ["Differenza tra dolo e colpa?", "Dolo: intenzione; colpa: negligenza/imprudenza.", 26],
      ["Cos'è l'usucapione?", "Acquisto della proprietà per possesso protratto nel tempo.", 22],
      ["Elementi essenziali del contratto?", "Accordo, causa, oggetto, forma (se richiesta).", 10],
      ["Cos'è la novazione?", "Estinzione di un'obbligazione sostituita da una nuova.", 3],
    ],
  },
  {
    name: "Analisi 1",
    cards: [
      ["Definizione di limite?", "Valore a cui tende f(x) quando x tende a un punto.", 33],
      ["Teorema di Rolle?", "Se f continua, derivabile e f(a)=f(b), ∃ c con f'(c)=0.", 27],
      ["Derivata di ln(x)?", "1/x.", 20],
      ["Cos'è un asintoto obliquo?", "Retta y=mx+q a cui il grafico si avvicina all'infinito.", 9],
      ["Regola di de l'Hôpital?", "Per forme 0/0 o ∞/∞: lim f/g = lim f'/g'.", 1],
    ],
  },
];

/**
 * Build sample decks and a review-event log with a deliberately story-worthy
 * shape: a 30-day streak, a 3-day break, a comeback, another run, a record day,
 * and a live 15-day streak ending today.
 */
export function generateDemoHistory(now: number = Date.now()): {
  decks: Deck[];
  events: ReviewEvent[];
} {
  const rng = mulberry32(42);

  const decks: Deck[] = DECK_SPECS.map((spec) => ({
    id: uid(),
    name: spec.name,
    cards: spec.cards.map(([front, back, interval]): Card => ({
      id: uid(),
      front,
      back,
      schedule: {
        repetitions: interval > 1 ? 4 : 1,
        easeFactor: Math.round((2.3 + rng() * 0.4) * 100) / 100,
        interval,
      },
      dueDate: now + interval * DAY,
      createdAt: now - 90 * DAY,
    })),
  }));

  const cardIds = decks.flatMap((d) => d.cards.map((c) => c.id));
  const deckIdOf = new Map(decks.flatMap((d) => d.cards.map((c) => [c.id, d.id] as const)));

  // Active-day offsets (days before now). Gaps between the segments create the
  // broken streaks, comebacks and setbacks the diary narrates.
  const offsets: number[] = [];
  for (let k = 89; k >= 60; k--) offsets.push(k); // 30-day streak
  for (let k = 56; k >= 30; k--) offsets.push(k); // resume (27 days)
  for (let k = 14; k >= 0; k--) offsets.push(k); //  live 15-day streak → today

  const events: ReviewEvent[] = [];
  for (const offset of offsets) {
    const base = dayAt(now, offset);
    const count = offset === 20 ? 30 : 5 + Math.floor(rng() * 10); // one record day
    for (let i = 0; i < count; i++) {
      const cardId = cardIds[Math.floor(rng() * cardIds.length)];
      const correct = rng() > 0.15;
      const quality = correct ? (rng() > 0.5 ? 5 : 4) : rng() > 0.5 ? 2 : 1;
      events.push({
        at: base + i * 3 * 60_000, // 3 minutes apart
        deckId: deckIdOf.get(cardId)!,
        cardId,
        quality,
        correct,
      });
    }
  }
  events.sort((a, b) => a.at - b.at);

  return { decks, events };
}
