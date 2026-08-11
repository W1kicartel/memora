import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, Deck, ReviewEvent, Settings } from "./types";
import { review, isDue, INITIAL_STATE, type Quality } from "./sm2";
import { parseCards, type ParsedCard } from "./import";
import {
  loadDecks, saveDecks, loadEvents, saveEvents,
  loadSettings, saveSettings,
  uid, exportAll,
} from "./storage";
import { explainCard, gradeAnswer, ClaudeError, type ExplainMode } from "./claude";
import { Dashboard } from "./dashboard";
import { WorkgroupView } from "./workgroupview";
import { AIAssistant } from "./ai";
import { LifeView } from "./lifeview";
import { loadLife, saveLife, type LifeState } from "./life";
import { generateDemoHistory } from "./demo";
import { LangContext, translate, useT, LANGS, type Lang, type TFn } from "./i18n";
import { loadProfile, saveProfile } from "./workgroup";
import {
  IconDecks, IconProgress, IconLife, IconUsers, IconAI, IconSettings,
  IconArrowLeft, IconTrash, IconUpload, IconDownload, IconCheck, IconKey,
  IconLogo, IconMenu, IconClose,
} from "./icons";
import { SongWidget } from "./songwidget";
import { completeSpotifyBrowserAuth } from "./music";
import { initCardTilt, initRipple, initMagnetic } from "./cinematic";
import { aiConfigured, statusLabel, useOllamaStatus, retryOllama, DEFAULT_OLLAMA_MODEL } from "./ollama";

/* ─── helpers ───────────────────────────────────────────────────────────── */

function dueCards(deck: Deck, now: number): Card[] {
  return deck.cards.filter((c) => c.dueDate === 0 || isDue(c.dueDate, now));
}

function makeCard(front: string, back: string): Card {
  return {
    id: uid(), front, back,
    schedule: { ...INITIAL_STATE }, dueDate: 0, createdAt: Date.now(),
  };
}

type Tab = "decks" | "deck" | "study" | "dashboard" | "groups" | "ai" | "life" | "settings";
type View =
  | { tab: "decks" | "dashboard" | "groups" | "ai" | "life" | "settings" }
  | { tab: "deck"; deckId: string }
  | { tab: "study"; deckId: string; reviewAll?: boolean };

const NAV: { tab: Tab; labelKey: string; icon: React.ReactNode }[] = [
  { tab: "decks",     labelKey: "nav.decks",    icon: <IconDecks size={15} /> },
  { tab: "dashboard", labelKey: "nav.progress", icon: <IconProgress size={15} /> },
  { tab: "life",      labelKey: "nav.life",     icon: <IconLife size={15} /> },
  { tab: "groups",    labelKey: "nav.groups",   icon: <IconUsers size={15} /> },
  { tab: "ai",        labelKey: "nav.ai",       icon: <IconAI size={15} /> },
  { tab: "settings",  labelKey: "nav.profile",  icon: <IconSettings size={15} /> },
];

/* ─── App ────────────────────────────────────────────────────────────────── */

export function App() {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  const [events, setEvents] = useState<ReviewEvent[]>(() => loadEvents());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [life, setLife] = useState<LifeState>(() => loadLife());
  const [view, setView] = useState<View>({ tab: "decks" });
  const [navOpen, setNavOpen] = useState(true);
  // App hosts the language provider, so it translates directly rather than via useT().
  const t: TFn = (key, params) => translate(settings.lang, key, params);

  useEffect(() => saveDecks(decks), [decks]);
  useEffect(() => saveEvents(events), [events]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveLife(life), [life]);

  /* Apply the theme to the document root so CSS tokens switch (light default). */
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  /* Cinematic engine: ripple, card tilt, magnetic pull */
  useEffect(() => {
    const cleanups = [initRipple(), initCardTilt(), initMagnetic()];
    return () => cleanups.forEach((fn) => fn());
  }, []);

  /* Browser-mode Spotify OAuth: if we just landed on /callback, finish it.
     The bacheca's song widget listens for the event and reloads its state. */
  useEffect(() => {
    completeSpotifyBrowserAuth()
      .then((auth) => { if (auth) window.dispatchEvent(new Event("memora:music-updated")); })
      .catch(() => { /* the widget will simply show the connect card again */ });
  }, []);

  /* Scroll-reveal — fires when view changes, with a 60ms settle delay */
  useEffect(() => {
    const t = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".reveal:not(.visible)")
        .forEach((el, i) => setTimeout(() => el.classList.add("visible"), i * 55));
    }, 60);
    return () => clearTimeout(t);
  }, [view, decks]);

  const activeDeck =
    view.tab === "deck" || view.tab === "study"
      ? decks.find((d) => d.id === view.deckId) ?? null
      : null;

  useEffect(() => {
    if ((view.tab === "deck" || view.tab === "study") && !activeDeck) {
      setView({ tab: "decks" });
    }
  }, [view, activeDeck]);

  function recordReview(deckId: string, card: Card, quality: Quality) {
    const schedule = review(card.schedule, quality);
    const dueDate = Date.now() + schedule.interval * 86_400_000;
    setDecks((ds) =>
      ds.map((d) =>
        d.id !== deckId ? d
          : { ...d, cards: d.cards.map((c) => c.id === card.id ? { ...c, schedule, dueDate } : c) }
      )
    );
    const now = Date.now();
    setEvents((ev) => [...ev, { at: now, deckId, cardId: card.id, quality, correct: quality >= 3 }]);
  }

  /** Dev/demo: replace decks + events with a rich sample history to explore the social layer. */
  function loadDemo() {
    const { decks: d, events: e } = generateDemoHistory();
    setDecks(d);
    setEvents(e);
    setView({ tab: "dashboard" });
  }

  function addCards(deckId: string | null, newName: string, cards: ParsedCard[]) {
    const made = cards.map((c) => makeCard(c.front, c.back));
    if (deckId) {
      setDecks((ds) => ds.map((d) => d.id === deckId ? { ...d, cards: [...d.cards, ...made] } : d));
    } else {
      setDecks((ds) => [...ds, { id: uid(), name: newName, cards: made }]);
    }
  }

  return (
    <LangContext.Provider value={settings.lang}>
      {/* Ambient backdrop — pure CSS gradient mesh, no canvas */}
      <div className="backdrop" aria-hidden="true" />

      <div className={navOpen ? "app" : "app nav-closed"}>
        <header className="topbar">
          <button
            className="nav-toggle"
            onClick={() => setNavOpen((o) => !o)}
            title={navOpen ? "Hide menu" : "Show menu"}
            aria-label={navOpen ? "Hide menu" : "Show menu"}
            aria-expanded={navOpen}
          >
            <IconMenu size={16} />
          </button>
          <h1 onClick={() => setView({ tab: "decks" })}>Memora</h1>
          <span className="tagline">{t("app.tagline")}</span>
          <span className="topbar-date">
            {new Date().toLocaleDateString(settings.lang === "en" ? "en-GB" : settings.lang, {
              weekday: "long", day: "numeric", month: "long",
            })}
          </span>
        </header>

        <nav className="nav">
          <div className="nav-head">
            <span className="nav-logo"><IconLogo size={17} />Memora</span>
            <button
              className="nav-close"
              onClick={() => setNavOpen(false)}
              title="Hide menu"
              aria-label="Hide menu"
            >
              <IconClose size={14} />
            </button>
          </div>
          {NAV.map((n) => (
            <button
              key={n.tab}
              className={
                view.tab === n.tab || (n.tab === "decks" && view.tab === "deck")
                  ? "nav-item on" : "nav-item"
              }
              onClick={() => setView({ tab: n.tab } as View)}
            >
              <span className="nav-icon">{n.icon}</span>
              {t(n.labelKey)}
            </button>
          ))}
        </nav>

        {view.tab === "decks" && (
          <DeckList
            decks={decks}
            events={events}
            onOpen={(id) => setView({ tab: "deck", deckId: id })}
            onCreate={(name) => setDecks((ds) => [...ds, { id: uid(), name, cards: [] }])}
            onDelete={(id) => setDecks((ds) => ds.filter((d) => d.id !== id))}
          />
        )}

        {view.tab === "deck" && activeDeck && (
          <DeckDetail
            deck={activeDeck}
            onBack={() => setView({ tab: "decks" })}
            onStudy={() => setView({ tab: "study", deckId: activeDeck.id })}
            onStudyAll={() => setView({ tab: "study", deckId: activeDeck.id, reviewAll: true })}
            onAddCard={(f, b) => addCards(activeDeck.id, "", [{ front: f, back: b }])}
            onImportCards={(cs) => addCards(activeDeck.id, "", cs)}
            onDeleteCard={(cardId) =>
              setDecks((ds) =>
                ds.map((d) => d.id === activeDeck.id
                  ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d)
              )
            }
          />
        )}

        {view.tab === "study" && activeDeck && (
          <StudySession
            deck={activeDeck}
            settings={settings}
            reviewAll={view.reviewAll}
            onExit={() => setView({ tab: "deck", deckId: activeDeck.id })}
            onGrade={(card, q) => recordReview(activeDeck.id, card, q)}
          />
        )}

        {view.tab === "dashboard" && <Dashboard decks={decks} events={events} />}
        {view.tab === "life"      && <LifeView life={life} setLife={setLife} events={events} settings={settings} />}
        {view.tab === "groups"    && (
          <WorkgroupView
            decks={decks}
            onImportDeck={(name, cards) => addCards(null, name, cards)}
          />
        )}
        {view.tab === "ai"        && (
          <AIAssistant
            settings={settings}
            decks={decks}
            onAddCards={addCards}
            onGoSettings={() => setView({ tab: "settings" })}
          />
        )}
        {view.tab === "settings"  && <ProfileView settings={settings} onChange={setSettings} onLoadDemo={loadDemo} />}

        <footer className="footer">
          Memora · fatto con <span className="footer-heart" aria-hidden="true">♥</span> per te · MIT License
        </footer>

        <UpdateToast />
      </div>
    </LangContext.Provider>
  );
}

/* ─── Auto-update toast ──────────────────────────────────────────────────── */

type UpdateStatus = { phase: "downloading" | "ready"; version?: string; progress?: number };

/**
 * A small paper note that slides in when a new version is on its way
 * (published as a GitHub release; electron-updater does the delivery).
 * Also listens to a "memora:update-demo" event so the flow can be previewed
 * in dev, where the Electron bridge is absent.
 */
function UpdateToast() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const off = window.memoraAI?.onUpdate?.(setStatus);
    const demo = (e: Event) => setStatus((e as CustomEvent<UpdateStatus>).detail);
    window.addEventListener("memora:update-demo", demo);
    return () => { off?.(); window.removeEventListener("memora:update-demo", demo); };
  }, []);

  if (!status || dismissed) return null;

  return (
    <div className="update-toast" role="status">
      <span className="update-toast-orn" aria-hidden="true">✦</span>
      {status.phase === "downloading" ? (
        <p>
          Nuova versione{status.version ? ` ${status.version}` : ""} in arrivo…
          {status.progress != null && ` ${Math.round(status.progress)}%`}
        </p>
      ) : (
        <>
          <p>Aggiornamento{status.version ? ` ${status.version}` : ""} pronto <span aria-hidden="true">♥</span></p>
          <button className="primary small" onClick={() => window.memoraAI?.installUpdate?.()}>
            Riavvia e aggiorna
          </button>
        </>
      )}
      <button className="icon update-toast-close" title="Più tardi" onClick={() => setDismissed(true)}>
        <IconClose size={12} />
      </button>
    </div>
  );
}

/* ─── Hero strip ─────────────────────────────────────────────────────────── */

function HeroStrip({ decks, events }: { decks: Deck[]; events: ReviewEvent[] }) {
  const now = Date.now();
  const totalDue = decks.reduce((sum, d) => sum + dueCards(d, now).length, 0);
  const totalReviews = events.length;

  return (
    <div className="hero-strip">
      <div className="hero-eyebrow">
        <span className="hero-eyebrow-dot" />
        {decks.length === 0 ? "No decks yet" : `${decks.length} deck${decks.length !== 1 ? "s" : ""} active`}
      </div>
      <h1 className="hero-headline">
        Ready when<br /><em>you are.</em>
      </h1>
      {/* A note left between the pages: taped-on scrap, sealed with wax. */}
      <div className="hero-note" aria-label="You are allowed to want more btw.">
        <p>You are allowed to want more btw.</p>
        <div className="wax-seal" aria-hidden="true"><span>♥</span></div>
      </div>
      <div className="hero-stats">
        <div className="hero-stat">
          <span className="hero-stat-n">{totalDue}</span>
          <span className="hero-stat-l">due now</span>
        </div>
        <div className="hero-sep" />
        <div className="hero-stat">
          <span className="hero-stat-n">{totalReviews}</span>
          <span className="hero-stat-l">reviews</span>
        </div>
        <div className="hero-sep" />
        <div className="hero-stat">
          <span className="hero-stat-n">{decks.reduce((s, d) => s + d.cards.length, 0)}</span>
          <span className="hero-stat-l">cards</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Deck list ──────────────────────────────────────────────────────────── */

function DeckList(props: {
  decks: Deck[];
  events: ReviewEvent[];
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const now = Date.now();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = name.trim();
    if (!t) return;
    props.onCreate(t);
    setName("");
  };
  return (
    <main>
      <HeroStrip decks={props.decks} events={props.events} />

      <form className="add-deck-form" onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New deck name…" />
        <button type="submit" className="primary">Add deck</button>
      </form>

      {/* The bacheca: today's song pinned among the decks. */}
      <SongWidget />

      {props.decks.length === 0 && (
        <div className="empty-state">
          <span className="empty-orn" aria-hidden="true">⁂</span>
          <p>Every collection starts with a single card.</p>
          <span className="hint">Name a deck above and begin.</span>
        </div>
      )}
      <ul className="deck-grid" style={{ marginTop: "1.1rem" }}>
        {props.decks.map((d) => {
          const due = dueCards(d, now).length;
          return (
            <li key={d.id} className="deck-card reveal">
              {/* accent line revealed on hover via CSS */}
              <div className="deck-card-accent" />
              <button className="deck-open" onClick={() => props.onOpen(d.id)}>
                <strong>{d.name}</strong>
                <span className="meta">
                  {d.cards.length} cards
                  {due > 0 && <em className="badge">{due} due</em>}
                </span>
              </button>
              <button
                className="icon danger"
                title="Delete deck"
                onClick={() => props.onDelete(d.id)}
                style={{ padding: "0 .75rem", zIndex: 1 }}
              >
                <IconTrash size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

/* ─── Deck detail ────────────────────────────────────────────────────────── */

function DeckDetail(props: {
  deck: Deck;
  onBack: () => void;
  onStudy: () => void;
  onStudyAll: () => void;
  onAddCard: (front: string, back: string) => void;
  onImportCards: (cards: ParsedCard[]) => void;
  onDeleteCard: (id: string) => void;
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [showImport, setShowImport] = useState(false);
  const due = useMemo(() => dueCards(props.deck, Date.now()).length, [props.deck]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    props.onAddCard(front.trim(), back.trim());
    setFront(""); setBack("");
  };
  return (
    <main>
      <div className="row spread">
        <button className="link" onClick={props.onBack} style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
          <IconArrowLeft size={14} /> All decks
        </button>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          {due > 0 && (
            <button className="primary" onClick={props.onStudy}>
              Study {due} due
            </button>
          )}
          <button className="ghost" onClick={props.onStudyAll} disabled={props.deck.cards.length === 0}>
            Review all ({props.deck.cards.length})
          </button>
        </div>
      </div>
      <h2 style={{ marginTop: "1.1rem" }}>{props.deck.name}</h2>
      <form className="card-form" onSubmit={submit}>
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question)" />
        <input value={back}  onChange={(e) => setBack(e.target.value)}  placeholder="Back (answer)" />
        <button type="submit">Add</button>
      </form>
      <div className="import-bar">
        <button
          className="ghost"
          onClick={() => setShowImport((s) => !s)}
          aria-expanded={showImport}
          style={{ display: "flex", alignItems: "center", gap: ".4rem" }}
        >
          <IconUpload size={14} />
          {showImport ? "Close import" : "Import cards"}
        </button>
      </div>
      {showImport && (
        <ImportPanel onImport={(cards) => { props.onImportCards(cards); setShowImport(false); }} />
      )}
      <ul className="card-list">
        {props.deck.cards.map((c) => (
          <li key={c.id} className="reveal">
            <div className="card-text">
              <span className="front">{c.front}</span>
              <span className="back">{c.back}</span>
            </div>
            <div className="card-stats">
              <span title="ease factor">EF {c.schedule.easeFactor.toFixed(2)}</span>
              <span title="interval">{c.schedule.interval}d</span>
              <button className="icon danger" onClick={() => props.onDeleteCard(c.id)} title="Delete card">
                <IconTrash size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

/* ─── Import panel ───────────────────────────────────────────────────────── */

const IMPORT_PLACEHOLDER = `Paste one card per line. Front and back separated by tab, comma, ; | or ::

capital of France, Paris
photosynthesis :: plants turning light into energy
H2O | water`;

const DELIMITER_LABEL: Record<string, string> = {
  "\t": "Tab", "::": "::", "|": "Pipe |", ";": "Semicolon ;", ",": "Comma ,",
};

function ImportPanel(props: { onImport: (cards: ParsedCard[]) => void }) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => parseCards(text), [text]);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };
  return (
    <section className="import-panel">
      <div className="import-actions">
        <button className="ghost" onClick={() => fileRef.current?.click()}
          style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
          <IconUpload size={14} /> Choose file (.csv, .tsv, .txt)
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/plain,text/csv" onChange={onFile} hidden />
        <span className="hint">…or paste below</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={IMPORT_PLACEHOLDER} rows={7} />
      <div className="import-footer">
        <span className="preview">
          {result.cards.length > 0 ? (
            <>
              <strong>{result.cards.length}</strong> card{result.cards.length === 1 ? "" : "s"} detected ·{" "}
              {DELIMITER_LABEL[result.delimiter]}
              {result.skipped > 0 && ` · ${result.skipped} skipped`}
            </>
          ) : "No cards detected yet"}
        </span>
        <button className="primary" disabled={result.cards.length === 0} onClick={() => props.onImport(result.cards)}>
          Add {result.cards.length || ""} card{result.cards.length === 1 ? "" : "s"}
        </button>
      </div>
    </section>
  );
}

/* ─── Study session ──────────────────────────────────────────────────────── */

const GRADES: { q: Quality; label: string; hint: string }[] = [
  { q: 0, label: "Blackout", hint: "no idea" },
  { q: 2, label: "Hard",     hint: "wrong" },
  { q: 3, label: "OK",       hint: "effort" },
  { q: 4, label: "Good",     hint: "correct" },
  { q: 5, label: "Easy",     hint: "instant" },
];

function StudySession(props: {
  deck: Deck;
  settings: Settings;
  reviewAll?: boolean;
  onExit: () => void;
  onGrade: (card: Card, q: Quality) => void;
}) {
  const [queue] = useState<string[]>(() => {
    if (props.reviewAll) {
      const all = [...props.deck.cards];
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      return all.map((c) => c.id);
    }
    return dueCards(props.deck, Date.now()).map((c) => c.id);
  });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [grade, setGrade] = useState<{ verdict: string; feedback: string; quality: number } | null>(null);

  const cardId = queue[index];
  const card = props.deck.cards.find((c) => c.id === cardId);
  const hasAI = aiConfigured(props.settings);

  function next(card: Card, q: Quality) {
    props.onGrade(card, q);
    setRevealed(false); setExplanation(null); setTyped(""); setGrade(null); setAiError(null);
    setIndex((i) => i + 1);
  }

  if (!card || index >= queue.length) {
    return (
      <main className="study done">
        <span className="done-orn" aria-hidden="true">⁂</span>
        <h2>Session complete</h2>
        <p>You reviewed {queue.length} card{queue.length === 1 ? "" : "s"}. Progress saved — see your dashboard.</p>
        <button className="primary" onClick={props.onExit}>Back to deck</button>
      </main>
    );
  }

  async function explain(mode: ExplainMode) {
    if (!card) return;
    setAiBusy(true); setAiError(null);
    try {
      setExplanation(await explainCard(props.settings, card.front, card.back, mode));
    } catch (e) {
      setAiError(e instanceof ClaudeError ? e.message : "AI error.");
    } finally { setAiBusy(false); }
  }

  async function gradeTyped() {
    if (!card || !typed.trim()) return;
    setAiBusy(true); setAiError(null);
    try {
      const r = await gradeAnswer(props.settings, card.front, card.back, typed);
      setGrade(r); setRevealed(true);
    } catch (e) {
      setAiError(e instanceof ClaudeError ? e.message : "AI error.");
    } finally { setAiBusy(false); }
  }

  const progressPct = Math.round((index / queue.length) * 100);

  return (
    <main className="study">
      {props.reviewAll && (
        <p className="hint review-all-notice">
          Open review — all {queue.length} cards, shuffled. Every answer is recorded.
        </p>
      )}
      <div className="study-header">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="progress-label">{index + 1} / {queue.length}</span>
        <button className="link" onClick={props.onExit}>End</button>
      </div>

      <div className="flashcard-scene">
        <div
          className={`flashcard${revealed ? " flipped" : ""}`}
          onClick={() => !revealed && setRevealed(true)}
          role="button"
          aria-label={revealed ? "Answer revealed" : "Click to reveal answer"}
        >
          <div className="flashcard-face flashcard-front">
            <span className="face-label">Question</span>
            <p className="face-question">{card.front}</p>
            {!revealed && <span className="hint" style={{ marginTop: ".5rem" }}>tap to reveal</span>}
          </div>
          <div className="flashcard-face flashcard-back">
            <span className="face-label">Answer</span>
            <p className="face-answer">{card.back}</p>
            {explanation && <div className="explanation">{explanation}</div>}
            {grade && (
              <div className={`grade-badge grade-${grade.verdict}`}>
                {grade.verdict.toUpperCase()} — {grade.feedback}
              </div>
            )}
          </div>
        </div>
      </div>

      {hasAI && !revealed && (
        <div className="ai-answer">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your answer for AI grading…"
            onKeyDown={(e) => e.key === "Enter" && gradeTyped()}
          />
          <button className="ghost" disabled={aiBusy || !typed.trim()} onClick={gradeTyped}>
            {aiBusy ? "…" : "Grade"}
          </button>
        </div>
      )}

      {!revealed ? (
        <button className="primary big" onClick={() => setRevealed(true)}>Show answer</button>
      ) : (
        <>
          <div className="grades">
            {GRADES.map((g) => (
              <button
                key={g.q}
                className={`grade-btn grade-btn-${g.q}`}
                onClick={() => next(card, grade ? (grade.quality as Quality) : g.q)}
                title={g.hint}
              >
                <strong>{g.label}</strong>
                <small>{g.hint}</small>
              </button>
            ))}
          </div>
          {hasAI && (
            <div className="explain-row">
              <span className="hint">Explain:</span>
              <button className="ghost small" disabled={aiBusy} onClick={() => explain("simply")}>Simpler</button>
              <button className="ghost small" disabled={aiBusy} onClick={() => explain("example")}>Example</button>
              <button className="ghost small" disabled={aiBusy} onClick={() => explain("mnemonic")}>Mnemonic</button>
            </div>
          )}
          {aiError && <p className="error-text">{aiError}</p>}
        </>
      )}
    </main>
  );
}

/* ─── Profile (identity + settings) ──────────────────────────────────────── */

const MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

function ProfileView({ settings, onChange, onLoadDemo }: { settings: Settings; onChange: (s: Settings) => void; onLoadDemo: () => void }) {
  const t = useT();
  const [key, setKey] = useState(settings.apiKey);
  const provider = settings.provider ?? "ollama";
  const ollamaStatus = useOllamaStatus(provider !== "claude", settings.ollamaModel || DEFAULT_OLLAMA_MODEL);
  const [name, setName] = useState(() => loadProfile()?.name ?? "");
  const [savedName, setSavedName] = useState(name);

  function saveName() {
    const p = saveProfile(name);
    setName(p.name);
    setSavedName(p.name);
  }

  function download() {
    const blob = new Blob([exportAll()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "memora-backup.json"; a.click();
    URL.revokeObjectURL(url);
  }

  const initial = (savedName.trim()[0] ?? "?").toUpperCase();

  return (
    <main>
      <h2>{t("profile.title")}</h2>

      <section className="card-box profile-hero">
        <div className="profile-avatar" aria-hidden="true">{initial}</div>
        <div className="profile-id">
          <label className="field-label">{t("profile.name")}</label>
          <div className="row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profile.namePh")}
              style={{ flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
            />
            <button className="primary" onClick={saveName} disabled={!name.trim() || name.trim() === savedName}>
              {t("profile.save")}
            </button>
          </div>
        </div>
      </section>

      <section className="card-box">
        <h3>{t("profile.language")}</h3>
        <div className="lang-grid">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={settings.lang === l.code ? "lang-pill on" : "lang-pill"}
              onClick={() => onChange({ ...settings, lang: l.code as Lang })}
            >
              <span className="lang-flag">{l.flag}</span>
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card-box">
        <h3>{t("set.ai")}</h3>
        <div className="provider-grid">
          <button
            className={provider !== "claude" ? "provider-card on" : "provider-card"}
            onClick={() => onChange({ ...settings, provider: "ollama" })}
          >
            <strong>{t("set.aiLocal")}</strong>
            <span>{t("set.aiLocalHint")}</span>
          </button>
          <button
            className={provider === "claude" ? "provider-card on" : "provider-card"}
            onClick={() => onChange({ ...settings, provider: "claude" })}
          >
            <strong>{t("set.aiClaude")}</strong>
            <span>{t("set.aiClaudeHint")}</span>
          </button>
        </div>

        {provider !== "claude" ? (
          <p
            className={ollamaStatus.phase === "ready" ? "ok-text" : "hint"}
            style={{ marginTop: ".85rem", display: "flex", alignItems: "center", gap: ".45rem", flexWrap: "wrap" }}
          >
            {ollamaStatus.phase === "ready" && <IconCheck size={13} />}
            {statusLabel(ollamaStatus)}
            {(ollamaStatus.phase === "error" || ollamaStatus.phase === "off") && (
              <button className="ghost small" onClick={retryOllama}>Riprova</button>
            )}
          </p>
        ) : (
          <div style={{ marginTop: ".85rem" }}>
            <p className="hint" style={{ marginBottom: ".8rem", display: "flex", alignItems: "center", gap: ".35rem" }}>
              <IconKey size={13} /> {t("set.claudeHint")}{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                {t("set.getKey")}
              </a>
            </p>
            <div className="row">
              <input
                type="password" value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-ant-…" autoComplete="off"
                style={{ flex: 1 }}
              />
              <button className="primary" onClick={() => onChange({ ...settings, apiKey: key.trim() })}>
                {t("set.saveKey")}
              </button>
            </div>
            {settings.apiKey && (
              <p className="ok-text" style={{ marginTop: ".5rem", display: "flex", alignItems: "center", gap: ".3rem" }}>
                <IconCheck size={13} /> {t("set.keySaved")}
              </p>
            )}
            <div className="row" style={{ marginTop: ".8rem" }}>
              <label className="field-label">{t("set.model")}</label>
              <select value={settings.model} onChange={(e) => onChange({ ...settings, model: e.target.value })}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}
      </section>

      <section className="card-box">
        <h3>{t("set.appearance")}</h3>
        <div className="row">
          <label className="field-label">{t("set.theme")}</label>
          <button
            className="ghost"
            onClick={() => onChange({ ...settings, theme: settings.theme === "light" ? "dark" : "light" })}
          >
            {settings.theme === "light" ? t("set.toDark") : t("set.toLight")}
          </button>
        </div>
      </section>

      <section className="card-box">
        <h3>{t("set.backup")}</h3>
        <p className="hint" style={{ marginBottom: ".7rem" }}>{t("set.backupHint")}</p>
        <button
          className="ghost"
          onClick={download}
          style={{ display: "inline-flex", alignItems: "center", gap: ".4rem" }}
        >
          <IconDownload size={14} /> {t("set.export")}
        </button>
      </section>

      <section className="card-box">
        <h3>{t("set.demo")}</h3>
        <p className="hint" style={{ marginBottom: ".7rem" }}>{t("set.demoHint")}</p>
        <button className="ghost" onClick={onLoadDemo}>
          {t("set.loadDemo")}
        </button>
      </section>
    </main>
  );
}
