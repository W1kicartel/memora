import type { Settings } from "./types";
import type { ParsedCard } from "./import";
import { extractJson, salvageArray } from "./jsonx";
import {
  type StudyLevel,
  type StudySubject,
  buildSystem,
  levelGuidance,
  subjectGuidance,
  groundingDirective,
  QUALITY_STANDARDS,
  MNEMONIC_TECHNIQUES,
  CARD_FORMAT_MIX,
} from "./engine";

import { ollamaChat, DEFAULT_OLLAMA_MODEL, OLLAMA_FALLBACK_MODEL, type OllamaMsg } from "./ollama";
import { learnerDirective } from "./learner";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Append the adaptive learner profile (learner.ts) to a system prompt: the
 * engine calibrates on the user's own weak/strong topics, so answers keep
 * getting better the more they study — locally, with either provider.
 */
function withLearner(system: string): string {
  const profile = learnerDirective();
  return profile ? `${system}\n\n${profile}` : system;
}

/** Error type for every AI feature, regardless of the active provider. */
export class ClaudeError extends Error {}

/**
 * A file normalised into something the Messages API accepts as input.
 * Video/audio/Office are converted upstream (see files.ts) — the API itself
 * only ingests PDF documents, images (jpeg/png/gif/webp) and text.
 */
export type Attachment =
  | { kind: "pdf"; name: string; data: string }                    // base64 PDF
  | { kind: "image"; name: string; mediaType: string; data: string } // base64 image
  | { kind: "text"; name: string; text: string };                  // extracted text

interface CallOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  attachments?: Attachment[];
}

/** Build the Anthropic `content` array: attachment blocks first, then the prompt. */
function buildContent(prompt: string, attachments: Attachment[]): unknown {
  if (attachments.length === 0) return prompt;
  const blocks: unknown[] = [];
  for (const a of attachments) {
    if (a.kind === "pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: a.data },
        ...(a.name ? { title: a.name } : {}),
      });
    } else if (a.kind === "image") {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: a.mediaType, data: a.data },
      });
    } else {
      blocks.push({ type: "text", text: `FILE "${a.name}":\n"""\n${a.text}\n"""` });
    }
  }
  blocks.push({ type: "text", text: prompt });
  return blocks;
}

interface Turn {
  role: "user" | "assistant";
  content: unknown;
}

interface RawReply {
  text: string;
  /** "end_turn" | "max_tokens" | … — "max_tokens" means the output was cut off. */
  stopReason: string;
}

/**
 * Flatten Anthropic-style content blocks into Ollama chat messages. Text and
 * images survive; PDFs cannot be ingested by a local model, so they fail with
 * an actionable message instead of silently producing garbage.
 */
function toOllamaMessages(messages: Turn[], system?: string): OllamaMsg[] {
  const out: OllamaMsg[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    let text = "";
    const images: string[] = [];
    for (const b of m.content as Array<{ type: string; text?: string; source?: { data?: string } }>) {
      if (b.type === "text") text += (text ? "\n\n" : "") + (b.text ?? "");
      else if (b.type === "image" && b.source?.data) images.push(b.source.data);
      else if (b.type === "document") {
        // With the local model active, files.ts already turns PDFs into text —
        // a raw document only reaches here if it was uploaded while Claude was
        // selected and the provider was switched afterwards.
        throw new ClaudeError(
          "Questo PDF era stato caricato per Claude. Rimuovilo e ricaricalo ora che l'IA locale è attiva: lo leggo sul tuo computer (con OCR se è scansionato).",
        );
      }
    }
    out.push({ role: m.role, content: text, ...(images.length ? { images } : {}) });
  }
  return out;
}

/** One chat round trip through the active provider (local Ollama or Claude). */
async function callClaudeRaw(
  settings: Settings,
  messages: Turn[],
  opts: CallOptions = {},
): Promise<RawReply> {
  if ((settings.provider ?? "ollama") !== "claude") {
    const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
    const msgs = toOllamaMessages(messages, opts.system);
    const chatOpts = { maxTokens: opts.maxTokens, temperature: opts.temperature };
    let reply: { text: string; stopReason: string };
    try {
      reply = await ollamaChat(model, msgs, chatOpts);
    } catch (e) {
      if (e instanceof ClaudeError) throw e;
      const detail = e instanceof Error ? e.message : String(e);
      // The specialised model can be missing (interrupted first setup, very
      // old Ollama): fall back to the base model transparently.
      if (/not found/i.test(detail) && model !== OLLAMA_FALLBACK_MODEL) {
        try {
          reply = await ollamaChat(OLLAMA_FALLBACK_MODEL, msgs, chatOpts);
          if (!reply.text.trim()) throw new ClaudeError("L'IA locale ha restituito una risposta vuota. Riprova.");
          return reply;
        } catch { /* fall through to the friendly error below */ }
      }
      if (/memory|memoria/i.test(detail)) {
        throw new ClaudeError(
          "Il PC non ha abbastanza memoria libera per il modello: chiudi qualche programma pesante (browser con molte schede, giochi) e riprova.",
        );
      }
      throw new ClaudeError(
        /HTTP|fetch|network|Failed/i.test(detail)
          ? "IA locale non raggiungibile. Apri l'app desktop di Memora (si configura da sola) o controlla che Ollama sia in esecuzione."
          : `IA locale: ${detail}`,
      );
    }
    if (!reply.text.trim()) throw new ClaudeError("L'IA locale ha restituito una risposta vuota. Riprova.");
    return reply;
  }

  if (!settings.apiKey) {
    throw new ClaudeError("Nessuna chiave API impostata. Aggiungi la tua chiave Anthropic nelle Impostazioni.");
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      // Nota: niente `temperature` — i modelli Claude attuali (Opus 5,
      // Sonnet 5, Opus 4.7+) rifiutano i parametri di sampling con un 400.
      body: JSON.stringify({
        model: settings.model,
        max_tokens: opts.maxTokens ?? 2048,
        system: opts.system,
        messages,
      }),
    });
  } catch (e) {
    throw new ClaudeError("Errore di rete. Controlla la connessione.");
  }

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message ?? detail;
    } catch { /* ignore */ }
    if (res.status === 401) throw new ClaudeError("Chiave API non valida (401).");
    if (res.status === 429) throw new ClaudeError("Troppe richieste (429). Riprova tra poco.");
    throw new ClaudeError(`Errore API Anthropic: ${detail}`);
  }

  const data = await res.json();
  // Current Claude models can decline a request via safety classifiers:
  // HTTP 200 with stop_reason "refusal" and (possibly) empty content.
  if (data.stop_reason === "refusal") {
    throw new ClaudeError("Claude ha rifiutato questa richiesta per motivi di sicurezza. Riformula il contenuto e riprova.");
  }
  // No trim here: continuations are concatenated verbatim, and trimming would
  // corrupt a resume that starts mid-word or mid-token.
  const text: string = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  if (!text.trim()) throw new ClaudeError("Claude ha restituito una risposta vuota.");
  return { text, stopReason: String(data.stop_reason ?? "end_turn") };
}

/** Single-shot call (short outputs: explain, grade, advice). */
export async function callClaude(
  settings: Settings,
  prompt: string,
  opts: CallOptions = {},
): Promise<string> {
  const content = buildContent(prompt, opts.attachments ?? []);
  const { text } = await callClaudeRaw(settings, [{ role: "user", content }], opts);
  return text.trim();
}

/** How many automatic "continue" rounds a long generation may use. */
const MAX_CONTINUATIONS = 3;

const CONTINUE_PROSE =
  "La tua risposta si è interrotta per il limite di lunghezza. RIPRENDI ESATTAMENTE dal punto in cui ti sei fermato: nessuna ripetizione, nessun preambolo, nessuna scusa — continua il testo come se non ci fosse stata alcuna interruzione.";

const CONTINUE_ARRAY =
  "L'array JSON si è interrotto per il limite di lunghezza. Restituisci SOLO un nuovo array JSON contenente gli item RIMANENTI, senza ripetere quelli già forniti e senza alcun testo fuori dal JSON. Se non restano item, restituisci [].";

/**
 * Long-form generation (markdown notes, scripts, guides) that never stops at
 * the token limit: when the reply is cut off, the partial output is fed back
 * and the model resumes exactly where it stopped.
 */
export async function callClaudeLong(
  settings: Settings,
  prompt: string,
  opts: CallOptions = {},
): Promise<string> {
  const content = buildContent(prompt, opts.attachments ?? []);
  let reply = await callClaudeRaw(settings, [{ role: "user", content }], opts);
  let full = reply.text;

  for (let round = 0; reply.stopReason === "max_tokens" && round < MAX_CONTINUATIONS; round++) {
    reply = await callClaudeRaw(settings, [
      { role: "user", content },
      { role: "assistant", content: full },
      { role: "user", content: CONTINUE_PROSE },
    ], opts);
    full += reply.text;
  }
  return full.trim();
}

/**
 * JSON-array generation with the same guarantee: on a token-limit cut the
 * model is asked for the REMAINING items in a fresh array, and every round is
 * parsed tolerantly (complete objects survive even a mid-item truncation).
 */
async function callClaudeArray<T>(
  settings: Settings,
  prompt: string,
  opts: CallOptions = {},
): Promise<T[]> {
  const content = buildContent(prompt, opts.attachments ?? []);
  let reply = await callClaudeRaw(settings, [{ role: "user", content }], opts);
  const items: T[] = extractJson<T[]>(reply.text) ?? salvageArray<T>(reply.text);
  let previous = reply.text;

  for (let round = 0; reply.stopReason === "max_tokens" && round < MAX_CONTINUATIONS; round++) {
    reply = await callClaudeRaw(settings, [
      { role: "user", content },
      { role: "assistant", content: previous },
      { role: "user", content: CONTINUE_ARRAY },
    ], opts);
    const more = extractJson<T[]>(reply.text) ?? salvageArray<T>(reply.text);
    if (!Array.isArray(more) || more.length === 0) break;
    items.push(...more);
    previous = reply.text;
  }

  if (items.length === 0) throw new ClaudeError("Impossibile interpretare il JSON dalla risposta.");
  return items;
}

/* ─── AI features ─────────────────────────────────────────────────────────── */

/** One card as produced by the engine, before its metadata is folded into the back. */
interface EngineCard {
  front?: string;
  /** Answer: secca in prima riga, poi 1-3 righe di contesto. */
  back?: string;
  /** Bloom level: ricordare | comprendere | applicare | analizzare. */
  bloom?: string;
  /** Hierarchical tag: materia::argomento::sottoargomento. */
  tag?: string;
  /** Source citation, e.g. "Festinger 1957" or "[Fonte: p. 12]". */
  source?: string;
  /** Mnemonic hook: vivid loci image, chunk label or acronym for this concept. */
  mnemo?: string;
}

/**
 * Fold Bloom level, hierarchical tag and source into the visible back of the
 * card. Keeps the {front, back} data model intact (no schema migration) while
 * still surfacing the engine metadata to the learner and to Anki on export.
 */
function composeBack(c: EngineCard): string {
  let body = String(c.back ?? "").trim();
  const mnemo = String(c.mnemo ?? "").trim();
  if (mnemo) body += `\n\n🧠 ${mnemo}`;
  const meta: string[] = [];
  if (c.source) meta.push(String(c.source).trim());
  const bloom = String(c.bloom ?? "").trim().toLowerCase();
  if (bloom) meta.push(`#${bloom}`);
  const tag = String(c.tag ?? "").trim();
  if (tag) meta.push(tag);
  return meta.length ? `${body}\n\n— ${meta.join(" · ")}` : body;
}

/**
 * Generate exam-grade flashcards from notes or an attached PDF.
 * Enforces atomicity, active recall, a format mix, Bloom tags, hierarchical
 * tags and a source citation on every card.
 */
export async function generateCards(
  settings: Settings,
  notes: string,
  level: StudyLevel,
  subject: StudySubject,
  attachments: Attachment[] = [],
): Promise<ParsedCard[]> {
  const hasSource = attachments.length > 0 || notes.trim().length > 0;
  const source = attachments.length ? "i file allegati" : "il materiale fornito";
  const notesSection = notes.trim()
    ? `\n\nMATERIALE TESTUALE:\n"""\n${notes}\n"""`
    : "";

  const prompt = `Analizza ${source} e crea UN NUMERO SUFFICIENTE di flashcard per coprire TUTTI i concetti, fatti, autori e paradigmi importanti in modo esaustivo. Non limitarti a pochi esempi.${notesSection}

Regole di produzione:
- ATOMICITÀ: una card = un solo concetto. Mai domande multiple nella stessa card.
- ACTIVE RECALL, non riconoscimento: la domanda deve forzare il recupero. Male: "La dissonanza cognitiva è importante?" Bene: "Chi propone la dissonanza cognitiva, in che anno, e qual è il paradigma sperimentale dello studio classico?"
- ${CARD_FORMAT_MIX}
- Retro: risposta secca nella prima riga del campo "back", poi 1-3 righe di contesto. Autore + anno dove pertinente. Terminologia IT (EN).
- "bloom": livello tassonomico (ricordare|comprendere|applicare|analizzare).
- "tag": gerarchico materia::argomento::sottoargomento (es. psicologia_sociale::influenza::conformismo).
- "source": citazione della fonte — con materiale caricato usa [Fonte: p. X]/[Fonte: slide Y]; senza materiale usa autore+anno APA.
- "mnemo": l'aggancio mnemonico della card (1 riga) usando la tecnica più adatta: immagine vivida da metodo dei loci per i concetti singoli, acronimo/acrostico per liste e sequenze, etichetta di chunk per gli elementi di una serie. Concreto e visualizzabile, mai generico.
- Ordina le card in chunk tematici coerenti da 3-5 card (il "tag" riflette il chunk).
- Niente duplicati. Per le cloze, inserisci {{c1::...}} nel campo "back" e nel "front" la frase con il buco.

Restituisci SOLO un array JSON: [{"front":"...","back":"...","bloom":"...","tag":"...","source":"...","mnemo":"..."}]. Nessun testo aggiuntivo.`;

  const raw = await callClaudeArray<EngineCard>(settings, prompt, {
    maxTokens: 16000,
    temperature: 0.3,
    system: withLearner(buildSystem(
      "MODULO FLASHCARDS: crei flashcard atomiche da active recall, pronte per l'import in Anki. Restituisci SOLO JSON valido, senza testo fuori dal JSON.",
      level,
      subject,
      hasSource,
    )),
    attachments,
  });
  return raw
    .filter((c) => c.front && c.back)
    .map((c) => ({ front: String(c.front).trim(), back: composeBack(c) }));
}

/**
 * Produce structured, exam-grade study notes (MODULO APPUNTI): Cornell layout,
 * a Mermaid concept map, comparative tables for competing theories, key-experiment
 * boxes, exam-trap boxes and a bilingual glossary.
 */
export async function summarize(
  settings: Settings,
  topicOrText: string,
  level: StudyLevel,
  subject: StudySubject,
  attachments: Attachment[] = [],
): Promise<string> {
  const hasSource = attachments.length > 0 || topicOrText.trim().length > 0;
  const source = attachments.length ? "i file allegati" : "il seguente materiale/argomento";
  const textSection = topicOrText.trim()
    ? `\n\nCONTENUTO:\n"""\n${topicOrText}\n"""`
    : "";

  const prompt = `Genera appunti di studio completi su ${source}. Densità ~1:8 rispetto all'originale: niente padding, niente frasi riempitive.${textSection}

Struttura OBBLIGATORIA (Markdown):
1. All'inizio, una MAPPA CONCETTUALE MNEMONICA in un blocco \`\`\`conceptmap contenente SOLO questo JSON:
{"title":"argomento centrale","chunks":[{"label":"nome del gruppo","acronym":"sigla mnemonica opzionale","concepts":[{"name":"concetto (autore, anno)","mnemo":"immagine vivida in 4-8 parole"}]}],"links":[{"from":"concetto A","to":"concetto B","label":"relazione"}]}
Regole della mappa: 3-5 chunks, ognuno con 3-5 concetti (chunking di Miller); ogni concetto ha il suo "mnemo" (metodo dei loci); "acronym" quando le iniziali del chunk formano una sigla pronunciabile; "links" solo per le 2-5 relazioni trasversali davvero importanti.
2. Gerarchia: ## per i macro-argomenti, ### per teorie/autori.
3. Per ogni cluster di teorie in competizione, una TABELLA comparativa Markdown (colonne tipiche: autore, anno, meccanismo/sequenza causale, evidenze, critiche). Es. teorie delle emozioni: James-Lange vs Cannon-Bard vs Schachter-Singer vs valutazione cognitiva.
4. Per ogni esperimento rilevante un box che inizia con la riga "> 🔬 **Esperimento chiave**" seguito da autore/anno → ipotesi → metodo (campione, disegno, VI/VD) → risultati → interpretazione → critiche/repliche.
5. Almeno un box "> ⚠️ **Trappola d'esame**" con le confusioni tipiche (coppie confondibili).
6. CHUNKING: ogni sezione contiene al massimo 3-5 concetti; se sono di più, spezzala in sotto-sezioni etichettate. Mai elenchi piatti oltre 5 voci.
7. Un box "> 🏛️ **Palazzo della memoria**" per ogni macro-argomento: un percorso spaziale in 3-5 tappe (es. ingresso → corridoio → cucina) dove ogni tappa ancora un concetto chiave a un'immagine vivida e bizzarra.
8. Per ogni lista o sequenza da memorizzare (fasi, criteri, componenti), proponi un acronimo o acrostico in italiano con il suo scioglimento.
9. In coda: un "## Glossario IT/EN" e una sezione "## Collegamenti trasversali" verso altri argomenti/esami.
10. Ogni sezione si chiude con una sintesi di 5 righe. Sfrutta la colonna cue con domande-guida in grassetto a inizio paragrafo.

Gli appunti devono bastare per studiare senza tornare al testo originale.`;

  return callClaudeLong(settings, prompt, {
    maxTokens: 16000,
    temperature: 0.4,
    system: withLearner(buildSystem(
      "MODULO APPUNTI: produci appunti in stile Cornell con mappa concettuale strutturata, tabelle comparative, box esperimento e trappole d'esame, glossario bilingue. Usa Markdown pulito (tabelle con | , blocchi ```conceptmap, citazioni >).",
      level,
      subject,
      hasSource,
    )),
    attachments,
  });
}

export type ExplainMode = "simply" | "example" | "mnemonic";

export async function explainCard(
  settings: Settings,
  front: string,
  back: string,
  mode: ExplainMode
): Promise<string> {
  const ask = {
    simply: "Spiega questo nel modo più semplice possibile, come a un ragazzo di 12 anni curioso.",
    example: "Dai un esempio concreto e memorabile che illustri questo concetto.",
    mnemonic: "Crea un breve aiuto mnemonico per ricordare questo.",
  }[mode];
  const prompt = `Flashcard:
D: ${front}
R: ${back}

${ask} Massimo 3-4 frasi.`;
  // maxTokens generoso: sui modelli attuali il "thinking" condivide il budget
  // di output con la risposta visibile.
  return callClaude(settings, prompt, {
    maxTokens: 2000,
    temperature: 0.6,
    system: withLearner("Rispondi SEMPRE in italiano. Non usare emoji."),
  });
}

export interface GradeResult {
  verdict: "correct" | "partial" | "wrong";
  quality: number;
  feedback: string;
}

export async function gradeAnswer(
  settings: Settings,
  front: string,
  back: string,
  userAnswer: string
): Promise<GradeResult> {
  const prompt = `Stai correggendo la risposta di uno studente a una flashcard.

Domanda: ${front}
Risposta di riferimento: ${back}
Risposta dello studente: ${userAnswer}

Valuta se la risposta dello studente è corretta nel significato (la formulazione può differire).
Restituisci SOLO JSON: {"verdict":"correct|partial|wrong","quality":0-5,"feedback":"una frase utile in italiano"}.
Guida qualità: corretta e sicura = 5, corretta = 4, parziale = 3, quasi sbagliata = 1, vuota/sbagliata = 0.`;
  const reply = await callClaude(settings, prompt, {
    maxTokens: 1500,
    temperature: 0.1,
    system: "Sei un valutatore imparziale e incoraggiante. Rispondi SEMPRE in italiano. Non usare emoji.",
  });
  const r = extractJson<Partial<GradeResult>>(reply);
  if (!r) throw new ClaudeError("Impossibile interpretare il giudizio.");
  const quality = Math.max(0, Math.min(5, Math.round(Number(r.quality ?? 0))));
  const verdict =
    r.verdict === "correct" || r.verdict === "partial" || r.verdict === "wrong"
      ? r.verdict
      : quality >= 4 ? "correct" : quality >= 3 ? "partial" : "wrong";
  return { verdict, quality, feedback: String(r.feedback ?? "").trim() };
}

/** Personalised financial advice based on the user's budget data. */
export async function financialAdvice(
  settings: Settings,
  monthlyIncome: number,
  monthlyBudget: number,
  monthlySpent: number,
  riskTolerance: "basso" | "medio" | "alto",
): Promise<string> {
  const savings = Math.max(0, monthlyIncome - monthlySpent);
  const prompt = `Profilo finanziario dell'utente:
- Reddito mensile: €${monthlyIncome}
- Budget mensile pianificato per le spese: €${monthlyBudget}
- Spese effettive questo mese: €${monthlySpent}
- Capacità di risparmio mensile stimata: €${savings}
- Propensione al rischio: ${riskTolerance}

Fornisci:
1. Valutazione della situazione finanziaria (1-2 frasi)
2. Quanto risparmiare ogni mese (regola 50/30/20 adattata alla situazione)
3. 2-3 strumenti finanziari concreti adatti al profilo (ETF, BTP, PAC, conto deposito, buoni fruttiferi, ecc.) con pro/contro brevi
4. Piano d'azione in 3 passi da seguire subito

Sii diretto, pratico e incoraggiante. Non vincolare legalmente, solo orientamento generale.`;

  return callClaude(settings, prompt, {
    maxTokens: 2000,
    temperature: 0.5,
    system: "Sei un consulente finanziario esperto che aiuta giovani italiani a fare i primi investimenti. Rispondi SEMPRE in italiano, in modo chiaro e accessibile. Non usare emoji.",
  });
}

export type ExamDifficulty = "facile" | "media" | "difficile";

/** One multiple-choice option with a diagnostic rationale. */
export interface ExamOption {
  text: string;
  correct: boolean;
  /** Why this option is right, or which misconception makes it a plausible trap. */
  why: string;
}

export interface ExamQuestion {
  question: string;
  options: ExamOption[];
  difficulty: ExamDifficulty;
  /** Topic tag, used by the post-test report to tell the student what to revise. */
  topic: string;
}

/**
 * Generate a realistic Italian-format multiple-choice mock exam: diagnostic
 * distractors (each tied to a real misconception), 30/50/20 difficulty mix,
 * clinical/experimental vignettes and a reasoned answer key.
 */
export async function generateMockExam(
  settings: Settings,
  material: string,
  level: StudyLevel,
  subject: StudySubject,
  count = 20,
  attachments: Attachment[] = [],
): Promise<ExamQuestion[]> {
  const hasSource = attachments.length > 0 || material.trim().length > 0;
  const source = attachments.length ? "i file allegati" : "il materiale fornito";
  const materialSection = material.trim()
    ? `\n\nMATERIALE:\n"""\n${material}\n"""`
    : "";

  const prompt = `Crea un mock test a crocette di ${count} item partendo da ${source}, formato esame italiano realistico.${materialSection}

Regole:
- 4 opzioni per item, UNA sola corretta.
- Distrattori DIAGNOSTICI: ogni distrattore corrisponde a una misconception reale o a un concetto affine confondibile. Mai opzioni palesemente assurde. Vietati "tutte le precedenti"/"nessuna delle precedenti".
- Calibrazione difficoltà: ~30% "facile" (definizioni/autori), ~50% "media" (comprensione/distinzioni), ~20% "difficile" (applicazione a vignette, integrazione, dettagli metodologici).
- Almeno il 20% degli item parte da una vignetta clinica o sperimentale ("Marco, 34 anni, presenta...").
- Stem chiaro; se la domanda è in negativo, scrivi la negazione in MAIUSCOLO ("quale NON è...").
- Per OGNI opzione, campo "why": perché è corretta, oppure quale misconception la rende un distrattore plausibile. Nel "why" dell'opzione corretta aggiungi, quando utile, un aggancio mnemonico rapido (immagine vivida o acronimo) per fissare il concetto.
- "topic": etichetta argomento per il report post-test.

Restituisci SOLO JSON: [{"question":"...","difficulty":"facile|media|difficile","topic":"...","options":[{"text":"...","correct":true|false,"why":"..."}]}]. Nessun testo aggiuntivo.`;

  const raw = await callClaudeArray<Partial<ExamQuestion>>(settings, prompt, {
    maxTokens: 16000,
    temperature: 0.5,
    system: withLearner(buildSystem(
      "MODULO MOCK TEST: prepari esami a crocette con distrattori diagnostici e answer key ragionata. Restituisci SOLO JSON valido.",
      level,
      subject,
      hasSource,
    )),
    attachments,
  });
  return raw
    .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2)
    .map((q): ExamQuestion => ({
      question: String(q.question).trim(),
      difficulty:
        q.difficulty === "facile" || q.difficulty === "difficile"
          ? q.difficulty
          : "media",
      topic: String(q.topic ?? "").trim() || "Generale",
      options: (q.options ?? [])
        .filter((o): o is ExamOption => Boolean(o && o.text))
        .map((o) => ({
          text: String(o.text).trim(),
          correct: Boolean(o.correct),
          why: String(o.why ?? "").trim(),
        })),
    }))
    // Guard against a malformed item with no correct answer marked.
    .filter((q) => q.options.some((o) => o.correct));
}

/* ─── Extra commands (studyguide / podcast / timeline / faq) ───────────────── */

export type ExtraCommand = "studyguide" | "podcast" | "timeline" | "faq";

const EXTRA_ROLE: Record<ExtraCommand, string> = {
  studyguide: "MODULO GUIDA DI STUDIO: sintesi operativa per orientare lo studio.",
  podcast: "MODULO PODCAST: script conversazionale a due voci pronto per TTS.",
  timeline: "MODULO TIMELINE: cronologia degli sviluppi teorici.",
  faq: "MODULO FAQ ORALE: domande probabili all'orale con risposte modello.",
};

function extraPrompt(cmd: ExtraCommand, topic: string, source: string): string {
  const on = `su "${topic}" a partire da ${source}`;
  switch (cmd) {
    case "studyguide":
      return `Crea una guida di studio ${on}, in Markdown: ## Obiettivi di apprendimento, ## Concetti chiave (con autore+anno, raggruppati in chunk da 3-5), ## Piano mnemonico (un palazzo della memoria in 3-5 tappe per i concetti portanti + un acronimo per ogni lista da memorizzare), ## Domande di autoverifica (8-12), ## Tempo di studio stimato, ## Errori tipici da evitare.`;
    case "podcast":
      return `Scrivi uno script di podcast ${on}: dialogo a due voci (Host curioso + Esperto) di ~8-10 minuti di parlato, in italiano, rigoroso ma conversazionale, con analogie e domande retoriche. Pronto per TTS: usa etichette "**Host:**" / "**Esperto:**", indica tra parentesi tono e pause dove utile. Copri autori, anni e paradigmi.`;
    case "timeline":
      return `Crea una timeline ${on}: cronologia in ordine temporale di scuole, autori, svolte paradigmatiche. Usa una tabella Markdown (Anno | Autore/Scuola | Contributo | Perché è una svolta) e chiudi con 3 righe sulle tendenze attuali.`;
    case "faq":
      return `Genera 10-15 FAQ ${on}: le domande più probabili all'orale, ciascuna con una risposta modello da 60-90 secondi di parlato (autore+anno, terminologia IT/EN). Formato: **D:** ... poi **R:** ...`;
  }
}

/** Generate one of the NotebookLM-style extra study artifacts as Markdown. */
export async function extraCommand(
  settings: Settings,
  cmd: ExtraCommand,
  topic: string,
  level: StudyLevel,
  subject: StudySubject,
  attachments: Attachment[] = [],
): Promise<string> {
  const hasSource = attachments.length > 0 || topic.trim().length > 0;
  const source = attachments.length ? "i file allegati" : "le tue conoscenze di riferimento del corso";
  return callClaudeLong(settings, extraPrompt(cmd, topic.trim() || "l'argomento", source), {
    maxTokens: 8192,
    temperature: cmd === "podcast" ? 0.7 : 0.5,
    system: withLearner([
      QUALITY_STANDARDS,
      "",
      subjectGuidance(subject),
      "",
      MNEMONIC_TECHNIQUES,
      "",
      EXTRA_ROLE[cmd],
      "",
      levelGuidance(level),
      "",
      groundingDirective(hasSource),
    ].join("\n")),
    attachments,
  });
}
