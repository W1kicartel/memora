import { useEffect, useRef, useState } from "react";
import type { Deck, Settings } from "./types";
import type { ParsedCard } from "./import";
import { IconUpload, IconDownload } from "./icons";
import {
  generateCards,
  summarize,
  generateMockExam,
  extraCommand,
  ClaudeError,
  type Attachment,
  type ExamQuestion,
  type ExtraCommand,
} from "./claude";
import { readAttachment } from "./files";
import {
  type StudyLevel,
  type StudySubject,
  LEVEL_LABELS,
  SUBJECT_LABELS,
  DEFAULT_LEVEL,
  DEFAULT_SUBJECT,
} from "./engine";
import { printHtml, exportNode, cardsToHtml, examToHtml } from "./exportpdf";
import { Markdown } from "./markdown";
import { track } from "./track";
import { statusLabel, useOllamaStatus, retryOllama, DEFAULT_OLLAMA_MODEL } from "./ollama";

type Tab = "cards" | "summary" | "exam" | "extra";

export function AIAssistant({
  settings,
  decks,
  onAddCards,
  onGoSettings,
}: {
  settings: Settings;
  decks: Deck[];
  onAddCards: (deckId: string | null, newName: string, cards: ParsedCard[]) => void;
  onGoSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>("cards");
  useEffect(() => track("nav_sub", `ia/${tab}`), [tab]);
  const [level, setLevel] = useState<StudyLevel>(DEFAULT_LEVEL);
  const [subject, setSubject] = useState<StudySubject>(DEFAULT_SUBJECT);
  const provider = settings.provider ?? "ollama";
  const ollamaStatus = useOllamaStatus(provider !== "claude", settings.ollamaModel || DEFAULT_OLLAMA_MODEL);

  if (provider === "claude" && !settings.apiKey) {
    return (
      <main>
        <h2>Study Engine</h2>
        <section className="card-box notice">
          <p>
            Hai scelto Claude come motore IA ma manca la chiave API. Aggiungila nel Profilo —
            oppure torna all'IA locale, che è gratis e non ha bisogno di nulla.
          </p>
          <button className="primary" onClick={onGoSettings}>
            Vai al Profilo
          </button>
        </section>
      </main>
    );
  }

  return (
    <main>
      <h2>Study Engine</h2>
      <p className="hint">
        Materiale di studio calibrato per materia: strategie d'esame dedicate, source grounding,
        mnemotecniche integrate ed esportazione in PDF.
      </p>

      {provider !== "claude" && ollamaStatus.phase !== "ready" && (
        <div className={`ai-status-banner${ollamaStatus.phase === "error" || ollamaStatus.phase === "off" ? " warn" : ""}`}>
          <span>{statusLabel(ollamaStatus)}</span>
          {(ollamaStatus.phase === "pulling" || ollamaStatus.phase === "installing") && (
            <span className="ai-status-track">
              <span className="ai-status-fill" style={{ width: `${Math.round(ollamaStatus.progress ?? 0)}%` }} />
            </span>
          )}
          {(ollamaStatus.phase === "error" || ollamaStatus.phase === "off") && (
            <button className="ghost small" onClick={retryOllama}>Riprova</button>
          )}
        </div>
      )}

      <div className="picker-bar">
        <LevelPicker level={level} onChange={setLevel} />
        <label className="subject-picker">
          <span className="level-label">Materia:</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value as StudySubject)}>
            {(Object.keys(SUBJECT_LABELS) as StudySubject[]).map((s) => (
              <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="tabs">
        <button className={tab === "cards" ? "tab on" : "tab"} onClick={() => setTab("cards")}>
          Flashcards
        </button>
        <button className={tab === "summary" ? "tab on" : "tab"} onClick={() => setTab("summary")}>
          Appunti
        </button>
        <button className={tab === "exam" ? "tab on" : "tab"} onClick={() => setTab("exam")}>
          Mock test
        </button>
        <button className={tab === "extra" ? "tab on" : "tab"} onClick={() => setTab("extra")}>
          Extra
        </button>
      </div>

      {tab === "cards"   && <CardGenerator settings={settings} decks={decks} level={level} subject={subject} onAddCards={onAddCards} />}
      {tab === "summary" && <Summarizer settings={settings} level={level} subject={subject} />}
      {tab === "exam"    && <ExamMaker settings={settings} decks={decks} level={level} subject={subject} />}
      {tab === "extra"   && <ExtraPanel settings={settings} level={level} subject={subject} />}
    </main>
  );
}

/* ─── shared helpers ─────────────────────────────────────────────────────── */

function LevelPicker({ level, onChange }: { level: StudyLevel; onChange: (l: StudyLevel) => void }) {
  const levels: StudyLevel[] = ["triennale", "magistrale", "concorso"];
  return (
    <div className="level-picker">
      <span className="level-label">Livello:</span>
      {levels.map((l) => (
        <button
          key={l}
          className={l === level ? "level-pill on" : "level-pill"}
          onClick={() => onChange(l)}
          type="button"
        >
          {LEVEL_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

/** Small "Download PDF" action, consistent across panels. */
function PdfButton({ onClick }: { onClick: () => void }) {
  /* Every PDF export in this view goes through here, so one call covers
     flashcards, notes, mock tests and the extra tools alike. */
  return (
    <button className="ghost small pdf-btn" type="button"
      onClick={() => { track("export_pdf"); onClick(); }}
      style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
      <IconDownload size={13} /> Scarica PDF
    </button>
  );
}

function useAsync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Qualcosa è andato storto.");
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, run };
}

const KIND_BADGE: Record<Attachment["kind"], string> = {
  pdf: "PDF",
  image: "IMG",
  text: "TXT",
};

/**
 * Upload any number of files of ANY type. Each is normalised by readAttachment:
 * with Claude, PDFs/images go straight through; with the local model, PDFs are
 * turned into text on-device (OCR for scans). Office docs are text-extracted,
 * and files that can't be read surface an inline explanation.
 */
function Attachments({
  items,
  onChange,
  forLocalAI,
}: {
  items: Attachment[];
  onChange: (next: Attachment[]) => void;
  forLocalAI: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const accepted: Attachment[] = [];
    const warns: string[] = [];
    for (const f of files) {
      const r = await readAttachment(f, { forLocalAI, onProgress: setProgress });
      if (r.kind === "unsupported") warns.push(`${r.name} — ${r.reason}`);
      else accepted.push(r);
    }
    setProgress(null);
    setBusy(false);
    setWarnings(warns);
    if (accepted.length) onChange([...items, ...accepted]);
  };

  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div className="file-upload-row">
      <button
        className="ghost small"
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        style={{ display: "flex", alignItems: "center", gap: ".35rem" }}
      >
        <IconUpload size={13} /> {busy ? (progress ?? "Lettura…") : "Carica file (qualsiasi tipo)"}
      </button>
      <input ref={ref} type="file" multiple onChange={onPick} hidden />

      {items.map((a, i) => (
        <span key={i} className="file-badge">
          <span className="kind-chip">{KIND_BADGE[a.kind]}</span>
          {a.name}
          <button
            className="icon small"
            type="button"
            onClick={() => remove(i)}
            title="Rimuovi file"
            style={{ marginLeft: ".35rem", fontSize: ".8rem" }}
          >
            ×
          </button>
        </span>
      ))}

      {warnings.length > 0 && (
        <div className="attach-warn">
          {warnings.map((w, i) => (
            <p key={i}>⚠️ {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Notes → cards ──────────────────────────────────────────────────────── */

function CardGenerator({
  settings,
  decks,
  level,
  subject,
  onAddCards,
}: {
  settings: Settings;
  decks: Deck[];
  level: StudyLevel;
  subject: StudySubject;
  onAddCards: (deckId: string | null, newName: string, cards: ParsedCard[]) => void;
}) {
  const [notes, setNotes] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [target, setTarget] = useState<string>(decks[0]?.id ?? "__new");
  const [newName, setNewName] = useState("Deck AI");
  const { loading, error, run } = useAsync();

  const canGenerate = !loading && (notes.trim().length > 0 || atts.length > 0);

  return (
    <section className="card-box">
      <p className="hint">
        Carica PDF, immagini, Word, Excel, PowerPoint o incolla appunti — l'engine ancora le card
        alla fonte. Ogni card è atomica, in active recall, con tag Bloom e tag gerarchico.
      </p>

      <Attachments items={atts} onChange={setAtts} forLocalAI={(settings.provider ?? "ollama") !== "claude"} />

      <textarea
        rows={atts.length ? 3 : 7}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={atts.length ? "Aggiungi testo supplementare (opzionale)…" : "Incolla qui il materiale di studio…"}
      />

      <div className="row">
        <button
          className="primary"
          disabled={!canGenerate}
          onClick={() => run(async () => setCards(await generateCards(settings, notes, level, subject, atts)))}
        >
          {loading ? "Generazione in corso…" : "Genera card"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {cards.length > 0 && (
        <div className="generated">
          <div className="row spread">
            <p><strong>{cards.length}</strong> card generate:</p>
            <PdfButton onClick={() => printHtml(`Flashcards (${cards.length})`, cardsToHtml(cards))} />
          </div>
          <ul className="card-list">
            {cards.map((c, i) => (
              <li key={i}>
                <div className="card-text">
                  <span className="front">{c.front}</span>
                  <span className="back">{c.back}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="row">
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>Aggiungi a: {d.name}</option>
              ))}
              <option value="__new">+ Nuovo deck…</option>
            </select>
            {target === "__new" && (
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome deck" />
            )}
            <button
              className="primary"
              onClick={() => {
                onAddCards(target === "__new" ? null : target, newName.trim() || "Deck AI", cards);
                setCards([]);
                setNotes("");
                setAtts([]);
              }}
            >
              Aggiungi {cards.length} card
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Appunti ────────────────────────────────────────────────────────────── */

function Summarizer({ settings, level, subject }: { settings: Settings; level: StudyLevel; subject: StudySubject }) {
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [out, setOut]   = useState("");
  const outRef = useRef<HTMLDivElement>(null);
  const { loading, error, run } = useAsync();

  const canSummarize = !loading && (text.trim().length > 0 || atts.length > 0);
  const title = () => (text.trim().split("\n")[0] || "Appunti").slice(0, 60);

  return (
    <section className="card-box">
      <p className="hint">
        Appunti in stile Cornell: mappa concettuale schematica, tabelle comparative, box
        "🔬 Esperimento/Concetto chiave" e "⚠️ Trappola d'esame", palazzo della memoria e glossario.
      </p>

      <Attachments items={atts} onChange={setAtts} forLocalAI={(settings.provider ?? "ollama") !== "claude"} />

      <textarea
        rows={atts.length ? 3 : 6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={atts.length ? "Aggiungi testo supplementare (opzionale)…" : "Argomento o testo per gli appunti…"}
      />

      <div className="row spread">
        <button
          className="primary"
          disabled={!canSummarize}
          onClick={() => run(async () => {
            setOut("");
            // Stream tokens in as they're generated (local AI); Claude fills in at the end.
            const full = await summarize(settings, text, level, subject, atts, (chunk) => setOut((o) => o + chunk));
            setOut(full);
          })}
        >
          {loading ? "Sto scrivendo gli appunti…" : "Genera appunti"}
        </button>
        {out && <PdfButton onClick={() => exportNode(`Appunti — ${title()}`, outRef.current)} />}
      </div>
      {error && <p className="error-text">{error}</p>}
      {out && <div ref={outRef}><Markdown text={out} className="ai-output md" /></div>}
    </section>
  );
}

/* ─── Mock test (crocette interattive) ───────────────────────────────────── */

const DIFFICULTY_LABEL: Record<ExamQuestion["difficulty"], string> = {
  facile: "Facile",
  media: "Media",
  difficile: "Difficile",
};

function ExamMaker({ settings, decks, level, subject }: { settings: Settings; decks: Deck[]; level: StudyLevel; subject: StudySubject }) {
  const [source, setSource]     = useState<string>(decks[0]?.id ?? "__text");
  const [text, setText]         = useState("");
  const [atts, setAtts]         = useState<Attachment[]>([]);
  const [count, setCount]       = useState(20);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers]   = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const { loading, error, run } = useAsync();

  const material = () => {
    if (source === "__text") return text;
    const d = decks.find((x) => x.id === source);
    return d ? d.cards.map((c) => `${c.front} — ${c.back}`).join("\n") : "";
  };

  const canGenerate = !loading && (source !== "__text" || text.trim().length > 0 || atts.length > 0);

  const correctIndex = (q: ExamQuestion) => q.options.findIndex((o) => o.correct);
  const score = questions.reduce(
    (n, q, i) => (answers[i] === correctIndex(q) ? n + 1 : n),
    0,
  );
  const grade30 = questions.length ? Math.round((score / questions.length) * 30) : 0;
  const passed = grade30 >= 18;

  // Post-test report: wrong items grouped by topic.
  const weakByTopic: Record<string, number> = {};
  questions.forEach((q, i) => {
    if (submitted && answers[i] !== correctIndex(q)) {
      weakByTopic[q.topic] = (weakByTopic[q.topic] ?? 0) + 1;
    }
  });

  const reset = () => { setQuestions([]); setAnswers({}); setSubmitted(false); };

  return (
    <section className="card-box">
      <p className="hint">
        Test a crocette in formato esame italiano: distrattori diagnostici, mix di difficoltà
        30/50/20, vignette cliniche e answer key ragionata. Correzione automatica e voto in trentesimi.
      </p>

      <div className="row">
        <select value={source} onChange={(e) => { setSource(e.target.value); setAtts([]); reset(); }}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>Dal deck: {d.name}</option>
          ))}
          <option value="__text">Da file o testo…</option>
        </select>
        <label className="inline-num">
          N. item:
          <input
            type="number" min={5} max={40} value={count}
            onChange={(e) => setCount(Math.max(5, Math.min(40, Number(e.target.value) || 20)))}
          />
        </label>
        <button
          className="primary"
          disabled={!canGenerate}
          onClick={() =>
            run(async () => {
              reset();
              const mat = material();
              const a = source === "__text" ? atts : [];
              setQuestions(await generateMockExam(settings, mat, level, subject, count, a));
            })
          }
        >
          {loading ? "Creazione test…" : "Genera test"}
        </button>
      </div>

      {source === "__text" && (
        <>
          <Attachments items={atts} onChange={setAtts} forLocalAI={(settings.provider ?? "ollama") !== "claude"} />
          <textarea
            rows={atts.length ? 3 : 5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={atts.length ? "Aggiungi testo supplementare (opzionale)…" : "Incolla il materiale per il test…"}
          />
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      {questions.length > 0 && (
        <div className="exam">
          <div className="row spread">
            <p className="exam-count"><strong>{questions.length}</strong> domande</p>
            <PdfButton onClick={() => printHtml(`Mock test (${questions.length} item)`, examToHtml(questions))} />
          </div>
          {submitted && (
            <div className={passed ? "exam-report pass" : "exam-report fail"}>
              <p className="exam-score">
                {score}/{questions.length} — <strong>{grade30}/30</strong> {passed ? "✓ superato" : "✗ non superato"}
              </p>
              {Object.keys(weakByTopic).length > 0 && (
                <div className="exam-weak">
                  <p><strong>Da ripassare</strong> (item sbagliati per argomento):</p>
                  <ul>
                    {Object.entries(weakByTopic).map(([t, n]) => (
                      <li key={t}>{t}: {n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <ol className="exam-list">
            {questions.map((q, i) => {
              const ci = correctIndex(q);
              const chosen = answers[i];
              return (
                <li key={i} className="exam-item">
                  <p className="exam-q">
                    <span className={`diff-badge diff-${q.difficulty}`}>{DIFFICULTY_LABEL[q.difficulty]}</span>
                    {q.question}
                  </p>
                  <div className="exam-options">
                    {q.options.map((o, oi) => {
                      const isChosen = chosen === oi;
                      const state = submitted
                        ? oi === ci ? "correct" : isChosen ? "wrong" : ""
                        : isChosen ? "chosen" : "";
                      return (
                        <button
                          key={oi}
                          type="button"
                          className={`exam-opt ${state}`}
                          disabled={submitted}
                          onClick={() => setAnswers((a) => ({ ...a, [i]: oi }))}
                        >
                          <span className="opt-letter">{String.fromCharCode(65 + oi)}</span>
                          <span className="opt-text">{o.text}</span>
                          {submitted && (oi === ci || isChosen) && (
                            <span className="opt-why">{o.why}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>

          {!submitted ? (
            <button
              className="primary"
              disabled={Object.keys(answers).length < questions.length}
              onClick={() => setSubmitted(true)}
            >
              Correggi ({Object.keys(answers).length}/{questions.length})
            </button>
          ) : (
            <button className="ghost" onClick={reset}>Nuovo test</button>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── Extra (studyguide / podcast / timeline / faq) ──────────────────────── */

const EXTRA_META: Record<ExtraCommand, { label: string; hint: string }> = {
  studyguide: { label: "Guida di studio", hint: "Obiettivi, concetti chiave, autoverifica e tempo stimato." },
  podcast:    { label: "Podcast",         hint: "Script a due voci (Host + Esperto), ~8-10 min, pronto per TTS." },
  timeline:   { label: "Timeline",        hint: "Cronologia di scuole, autori e svolte paradigmatiche." },
  faq:        { label: "FAQ orale",       hint: "10-15 domande probabili all'orale con risposte modello." },
};

function ExtraPanel({ settings, level, subject }: { settings: Settings; level: StudyLevel; subject: StudySubject }) {
  const [cmd, setCmd]   = useState<ExtraCommand>("studyguide");
  const [topic, setTopic] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [out, setOut]   = useState("");
  const outRef = useRef<HTMLDivElement>(null);
  const { loading, error, run } = useAsync();

  const canRun = !loading && (topic.trim().length > 0 || atts.length > 0);

  return (
    <section className="card-box">
      <div className="tabs sub">
        {(Object.keys(EXTRA_META) as ExtraCommand[]).map((c) => (
          <button
            key={c}
            className={c === cmd ? "tab on" : "tab"}
            onClick={() => { setCmd(c); setOut(""); }}
          >
            {EXTRA_META[c].label}
          </button>
        ))}
      </div>

      <p className="hint">{EXTRA_META[cmd].hint}</p>

      <Attachments items={atts} onChange={setAtts} forLocalAI={(settings.provider ?? "ollama") !== "claude"} />

      <textarea
        rows={atts.length ? 2 : 3}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder={atts.length ? "Argomento specifico (opzionale)…" : "Argomento (es. teorie delle emozioni)…"}
      />

      <div className="row spread">
        <button
          className="primary"
          disabled={!canRun}
          onClick={() => run(async () => {
            setOut("");
            const full = await extraCommand(settings, cmd, topic, level, subject, atts, (chunk) => setOut((o) => o + chunk));
            setOut(full);
          })}
        >
          {loading ? "Sto scrivendo…" : `Genera ${EXTRA_META[cmd].label.toLowerCase()}`}
        </button>
        {out && <PdfButton onClick={() => exportNode(`${EXTRA_META[cmd].label} — ${(topic.trim() || "argomento").slice(0, 50)}`, outRef.current)} />}
      </div>
      {error && <p className="error-text">{error}</p>}
      {out && <div ref={outRef}><Markdown text={out} className="ai-output md" /></div>}
    </section>
  );
}
