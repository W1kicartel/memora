import type { ReviewState } from "./sm2";
import type { Lang } from "./i18n";

/** A single flashcard plus its SM-2 scheduling metadata. */
export interface Card {
  id: string;
  front: string;
  back: string;
  /** SM-2 learning state. */
  schedule: ReviewState;
  /** Next due date as ms since epoch. 0 means "new / due now". */
  dueDate: number;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
}

/** A named collection of cards. */
export interface Deck {
  id: string;
  name: string;
  cards: Card[];
}

/**
 * One recorded review. The dashboard is built entirely from this event log,
 * so progress can be reconstructed and charted over time.
 */
export interface ReviewEvent {
  /** ms since epoch when the review happened. */
  at: number;
  deckId: string;
  cardId: string;
  /** SM-2 grade 0..5. */
  quality: number;
  /** quality >= 3 counts as a correct recall. */
  correct: boolean;
}

/** Which engine powers the AI features. */
export type AIProvider = "ollama" | "claude";

/** User settings, persisted locally. */
export interface Settings {
  /** AI engine: local Ollama (default, free and private) or the Claude API. */
  provider: AIProvider;
  /** Ollama model tag used when provider is "ollama". */
  ollamaModel: string;
  /** Anthropic API key (BYOK). Stored only in this browser. */
  apiKey: string;
  /** Claude model id used when provider is "claude". */
  model: string;
  /** Visual theme: warm paper, flat dark, or bubblegum pink. */
  theme: "light" | "dark" | "pink";
  /** UI language. */
  lang: Lang;
  /**
   * Degree family from the first-launch mini questionnaire — themes the
   * motivational phrases (see motivation.ts). Absent = not asked yet;
   * "altro" = answered "other / not a student".
   */
  faculty?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "claude",
  ollamaModel: "memora-engine",
  apiKey: "",
  model: "claude-opus-5",
  theme: "light",
  lang: "it",
};
