import type { Deck, ReviewEvent, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { INITIAL_STATE } from "./sm2";

const KEYS = {
  decks: "memora:decks:v1",
  events: "memora:events:v1",
  settings: "memora:settings:v1",
};

/** Generate a reasonably unique id without external deps. */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) — fail silently */
  }
}

/** A small starter deck so the app is useful on first load. */
export function seedDecks(): Deck[] {
  const make = (front: string, back: string) => ({
    id: uid(),
    front,
    back,
    schedule: { ...INITIAL_STATE },
    dueDate: 0,
    createdAt: Date.now(),
  });
  return [
    {
      id: uid(),
      name: "Getting started with Memora",
      cards: [
        make("What is spaced repetition?", "Reviewing material at increasing intervals, right before you would forget it — the most evidence-backed way to learn."),
        make("How do I add many cards fast?", "Open a deck → Import → paste text or upload a CSV/TXT file. Or let the AI generate a deck from your notes."),
        make("What can the AI engine do?", "Generate flashcards, structured notes and mock exams from any file (PDF, Word, PowerPoint, Excel, images) — with mnemonic hooks built in."),
        make("Which mnemonic techniques does Memora use?", "The three taught in executive memory training: the method of loci (memory palace), chunking, and acronyms/acrostics."),
      ],
    },
  ];
}

export const loadDecks = (): Deck[] => {
  const d = load<Deck[]>(KEYS.decks, []);
  return Array.isArray(d) && d.length ? d : seedDecks();
};
export const saveDecks = (decks: Deck[]): void => save(KEYS.decks, decks);

export const loadEvents = (): ReviewEvent[] => load<ReviewEvent[]>(KEYS.events, []);
export const saveEvents = (events: ReviewEvent[]): void => save(KEYS.events, events);

export const loadSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  ...load<Partial<Settings>>(KEYS.settings, {}),
});
export const saveSettings = (s: Settings): void => save(KEYS.settings, s);

/** Export everything as one JSON blob for backup. */
export function exportAll(): string {
  return JSON.stringify(
    {
      decks: loadDecks(),
      events: loadEvents(),
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}
