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
import { fileToAvatar } from "./avatar";
import { updateLearnerProfile } from "./learner";
import { FACULTIES, dailyPhrase, sessionPhrase } from "./motivation";
import { Memo } from "./tour";
import { startUsageHeartbeat } from "./usage";
import {
  IconDecks, IconProgress, IconLife, IconUsers, IconAI, IconSettings,
  IconArrowLeft, IconTrash, IconUpload, IconDownload, IconCheck, IconKey,
  IconLogo, IconMenu, IconClose,
} from "./icons";
import { SongWidget } from "./songwidget";
import { completeSpotifyBrowserAuth } from "./music";
import { initCardTilt, initRipple, initMagnetic } from "./cinematic";
import { aiConfigured, statusLabel, useOllamaStatus, retryOllama, DEFAULT_OLLAMA_MODEL } from "./ollama";
import { IS_SOCIAL, APP_NAME } from "./edition";
import { fetchUnseenNotices, markNoticeSeen, type Notice } from "./notices";
import { SUPPORT_CATEGORIES, sendSupport, type SupportCategory } from "./support";
import { GuidedTour, tourPending, resetTour } from "./tour";

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
  const [supportOpen, setSupportOpen] = useState(false);
  // First launch → Memo's guided tour (replayable from Profile).
  const [tourOpen, setTourOpen] = useState(() => tourPending());
  // App hosts the language provider, so it translates directly rather than via useT().
  const t: TFn = (key, params) => translate(settings.lang, key, params);

  useEffect(() => saveDecks(decks), [decks]);
  useEffect(() => saveEvents(events), [events]);
  /* Adaptive AI: refresh the learner profile whenever study data changes, so
     every prompt (local or Claude) calibrates on weak/strong topics. */
  useEffect(() => updateLearnerProfile(decks, events), [decks, events]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveLife(life), [life]);

  /* Apply the theme to the document root so CSS tokens switch (light default). */
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  /* One dist serves both editions in dev; the tab title follows the edition. */
  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  /* Cinematic engine: ripple, card tilt, magnetic pull */
  useEffect(() => {
    const cleanups = [initRipple(), initCardTilt(), initMagnetic()];
    return () => cleanups.forEach((fn) => fn());
  }, []);

  /* Anonymous usage heartbeat (powers the operator dashboard's stats). */
  useEffect(() => startUsageHeartbeat(), []);

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
          <h1 onClick={() => setView({ tab: "decks" })}>{APP_NAME}</h1>
          <span className="tagline">{t("app.tagline")}</span>
          <span className="topbar-date">
            {new Date().toLocaleDateString(settings.lang === "en" ? "en-GB" : settings.lang, {
              weekday: "long", day: "numeric", month: "long",
            })}
          </span>
        </header>

        <nav className="nav">
          <div className="nav-head">
            <span className="nav-logo"><IconLogo size={17} />{APP_NAME}</span>
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
              data-tour={n.tab}
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
          <button
            className="nav-item nav-support"
            data-tour="support"
            onClick={() => setSupportOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="nav-icon" aria-hidden="true">🛟</span>
            Supporto
          </button>
        </nav>

        {supportOpen && <SupportPanel onClose={() => setSupportOpen(false)} />}

        {tourOpen && (
          <GuidedTour
            onNavigate={(tab) => { setNavOpen(true); setView({ tab }); }}
            onDone={() => { setTourOpen(false); setView({ tab: "decks" }); }}
          />
        )}

        {/* Mini questionnaire: one tap, themes the motivational phrases.
            Shows once — after the tour for new installs, at next launch for
            existing users updating in. */}
        {!tourOpen && settings.faculty === undefined && (
          <FacultyPrompt onPick={(id) => setSettings({ ...settings, faculty: id })} />
        )}

        {view.tab === "decks" && (
          <DeckList
            decks={decks}
            events={events}
            faculty={settings.faculty}
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
            events={events}
            life={life}
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
        {view.tab === "settings"  && (
          <ProfileView
            settings={settings}
            onChange={setSettings}
            onLoadDemo={loadDemo}
            onReplayTour={() => { resetTour(); setView({ tab: "decks" }); setTourOpen(true); }}
          />
        )}

        <footer className="footer">
          {IS_SOCIAL
            ? <>Memora · studiare insieme è meglio · MIT License</>
            : <>Memora · fatto con <span className="footer-heart" aria-hidden="true">♥</span> per te · MIT License</>}
        </footer>

        <UpdateToast />
        <NoticesToast />
      </div>
    </LangContext.Provider>
  );
}

/* ─── Auto-update toast ──────────────────────────────────────────────────── */

type UpdateStatus = { phase: "downloading" | "ready" | "manual"; version?: string; progress?: number };

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
      ) : status.phase === "manual" ? (
        <>
          {/* macOS: no silent install without an Apple certificate — download
              the new installer and reinstall (data is kept). */}
          <p>È disponibile Memora{status.version ? ` ${status.version}` : ""}</p>
          <button className="primary small" onClick={() => window.memoraAI?.openUpdateDownload?.()}>
            Scarica l'aggiornamento
          </button>
        </>
      ) : (
        <>
          <p>Aggiornamento{status.version ? ` ${status.version}` : ""} pronto{!IS_SOCIAL && <span aria-hidden="true"> ♥</span>}</p>
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

/* ─── Support panel ──────────────────────────────────────────────────────── */

/**
 * The line to the operator: pick a reason, write, send. Tickets land on the
 * admin dashboard; replies come back as in-app notices, so there's nothing
 * else to configure — no email, no account.
 */
function SupportPanel({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<SupportCategory>("bug");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    if (!message.trim()) return;
    setState("sending");
    try {
      await sendSupport(category, message);
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "invio non riuscito");
      setState("error");
    }
  };

  return (
    <div className="support-overlay" role="dialog" aria-modal="true" aria-label="Supporto" onClick={onClose}>
      <div className="support-panel card-box" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h3 style={{ margin: 0 }}>🛟 Supporto</h3>
          <button className="icon" title="Chiudi" onClick={onClose}><IconClose size={13} /></button>
        </div>

        {state === "sent" ? (
          <div className="support-sent">
            <p><IconCheck size={15} /> <strong>Ricevuto!</strong></p>
            <p className="hint">
              Grazie — leggo tutto. Se serve una risposta, ti arriverà come
              notifica qui nell'app.
            </p>
            <button className="primary" onClick={onClose}>Chiudi</button>
          </div>
        ) : (
          <>
            <p className="hint" style={{ margin: ".4rem 0 .7rem" }}>
              Dimmi tutto: problemi, idee, segnalazioni. Rispondo con una
              notifica direttamente nell'app.
            </p>
            <label className="field-label">Motivo del contatto</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportCategory)}
              style={{ width: "100%", marginBottom: ".6rem" }}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === "bug" ? "Cosa stavi facendo? Cosa ti aspettavi? Cosa è successo invece?"
                : category === "idea" ? "Racconta la funzione dei tuoi sogni…"
                : category === "content" ? "In quale gruppo? Cosa hai visto?"
                : "Scrivi qui…"
              }
              rows={5}
              style={{ width: "100%", resize: "vertical" }}
            />
            {state === "error" && <p className="error-text">Invio non riuscito: {error}. Controlla la connessione e riprova.</p>}
            <div className="row" style={{ marginTop: ".7rem", justifyContent: "flex-end" }}>
              <button className="ghost" onClick={onClose}>Annulla</button>
              <button className="primary" disabled={!message.trim() || state === "sending"} onClick={send}>
                {state === "sending" ? "Invio…" : "Invia"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Faculty mini questionnaire ─────────────────────────────────────────── */

/**
 * One question, one tap: which degree family? Themes the motivational
 * phrases (motivation.ts) so encouragement speaks the user's language —
 * a med student and a law student read different words.
 */
function FacultyPrompt({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="support-overlay" role="dialog" aria-modal="true" aria-label="Cosa studi?">
      <div className="support-panel card-box faculty-panel">
        <div className="faculty-head">
          <Memo size={56} />
          <div>
            <h3 style={{ margin: 0 }}>Un'ultima cosa: cosa studi?</h3>
            <p className="hint" style={{ margin: ".25rem 0 0" }}>
              Così Memora ti parla nella lingua del tuo corso. Lo cambi quando vuoi dal Profilo.
            </p>
          </div>
        </div>
        <div className="faculty-grid">
          {FACULTIES.map((f) => (
            <button key={f.id} className="faculty-pill" onClick={() => onPick(f.id)}>
              <span aria-hidden="true">{f.emoji}</span> {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Operator notices ───────────────────────────────────────────────────── */

/**
 * Announcements sent from the admin dashboard (event reminders, news).
 * Checked shortly after launch and every 10 minutes; each notice is shown
 * once, as a paper note (plus a native toast where the platform grants it —
 * Electron does by default).
 */
function NoticesToast() {
  const [queue, setQueue] = useState<Notice[]>([]);

  useEffect(() => {
    let stop = false;
    const check = () => {
      fetchUnseenNotices()
        .then((ns) => {
          if (stop || ns.length === 0) return;
          setQueue(ns);
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(ns[0].title, { body: ns[0].body });
            }
          } catch { /* native toast unavailable — the in-app note still shows */ }
        })
        .catch(() => { /* offline — next interval retries */ });
    };
    const t = setTimeout(check, 6000);
    const id = setInterval(check, 10 * 60_000);
    return () => { stop = true; clearTimeout(t); clearInterval(id); };
  }, []);

  const notice = queue[0];
  if (!notice) return null;

  const dismiss = () => {
    markNoticeSeen(notice.id);
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="update-toast notice-toast" role="status">
      <span className="update-toast-orn" aria-hidden="true">📣</span>
      <div>
        <p><strong>{notice.title}</strong></p>
        {notice.body && <p className="notice-body">{notice.body}</p>}
      </div>
      <button className="icon update-toast-close" title="Ok" onClick={dismiss}>
        <IconClose size={12} />
      </button>
    </div>
  );
}

/* ─── Hero strip ─────────────────────────────────────────────────────────── */

function HeroStrip({ decks, events, faculty }: { decks: Deck[]; events: ReviewEvent[]; faculty?: string }) {
  const now = Date.now();
  const totalDue = decks.reduce((sum, d) => sum + dueCards(d, now).length, 0);
  const totalReviews = events.length;
  const motto = dailyPhrase(faculty, now);

  return (
    <div className="hero-strip">
      <div className="hero-eyebrow">
        <span className="hero-eyebrow-dot" />
        {decks.length === 0 ? "No decks yet" : `${decks.length} deck${decks.length !== 1 ? "s" : ""} active`}
      </div>
      <h1 className="hero-headline">
        Ready when<br /><em>you are.</em>
      </h1>
      {/* A note left between the pages: taped-on scrap, sealed with wax.
          Private edition only — the social build keeps the hero clean. */}
      {!IS_SOCIAL && (
        <div className="hero-note" aria-label="You are allowed to want more btw.">
          <p>You are allowed to want more btw.</p>
          <div className="wax-seal" aria-hidden="true"><span>♥</span></div>
        </div>
      )}
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
      {/* The phrase of the day — themed on the user's faculty. */}
      <p className="hero-motto">“{motto}”</p>
    </div>
  );
}

/* ─── Deck list ──────────────────────────────────────────────────────────── */

function DeckList(props: {
  decks: Deck[];
  events: ReviewEvent[];
  faculty?: string;
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
      <HeroStrip decks={props.decks} events={props.events} faculty={props.faculty} />

      <form className="add-deck-form" onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New deck name…" />
        <button type="submit" className="primary">Add deck</button>
      </form>

      {/* The bacheca: today's song pinned among the decks. The dedications are
          hers alone — the social edition ships without the song of the day. */}
      {!IS_SOCIAL && <SongWidget />}

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
  const done = !card || index >= queue.length;
  // Picked when the session completes, stable across re-renders.
  const endPhrase = useMemo(
    () => (done ? sessionPhrase(props.settings.faculty) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done],
  );

  function next(card: Card, q: Quality) {
    props.onGrade(card, q);
    setRevealed(false); setExplanation(null); setTyped(""); setGrade(null); setAiError(null);
    setIndex((i) => i + 1);
  }

  if (done) {
    return (
      <main className="study done">
        <span className="done-orn" aria-hidden="true">⁂</span>
        <h2>Session complete</h2>
        <p>You reviewed {queue.length} card{queue.length === 1 ? "" : "s"}. Progress saved — see your dashboard.</p>
        <p className="session-motto">“{endPhrase}”</p>
        <button className="primary" onClick={props.onExit}>Back to deck</button>
      </main>
    );
  }
  if (!card) return null;

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

function ProfileView({ settings, onChange, onLoadDemo, onReplayTour }: { settings: Settings; onChange: (s: Settings) => void; onLoadDemo: () => void; onReplayTour: () => void }) {
  const t = useT();
  const [key, setKey] = useState(settings.apiKey);
  const provider = settings.provider ?? "ollama";
  const ollamaStatus = useOllamaStatus(provider !== "claude", settings.ollamaModel || DEFAULT_OLLAMA_MODEL);
  const [name, setName] = useState(() => loadProfile()?.name ?? "");
  const [savedName, setSavedName] = useState(name);
  const [avatar, setAvatar] = useState<string | undefined>(() => loadProfile()?.avatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  function saveName() {
    const p = saveProfile(name);
    setName(p.name);
    setSavedName(p.name);
  }

  async function pickAvatar(file: File) {
    setAvatarError(null);
    try {
      const dataUrl = await fileToAvatar(file);
      // Needs a saved name: a profile without a name doesn't persist.
      const p = saveProfile(savedName || name.trim(), dataUrl);
      setAvatar(p.avatar);
      if (!savedName && p.name) { setSavedName(p.name); setName(p.name); }
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : "immagine non valida");
    }
  }

  function removeAvatar() {
    saveProfile(savedName || name.trim(), null);
    setAvatar(undefined);
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
        <button
          className="profile-avatar"
          title={avatar ? "Cambia foto profilo" : "Aggiungi una foto profilo"}
          onClick={() => avatarFileRef.current?.click()}
        >
          {avatar ? <img src={avatar} alt="Foto profilo" /> : initial}
          <span className="profile-avatar-edit" aria-hidden="true">📷</span>
        </button>
        <input
          ref={avatarFileRef} type="file" accept="image/*" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pickAvatar(f);
          }}
        />
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
          {avatarError && <p className="error-text" style={{ marginTop: ".4rem" }}>{avatarError}</p>}
          {avatar && (
            <button className="link" style={{ marginTop: ".4rem", fontSize: ".78rem" }} onClick={removeAvatar}>
              Rimuovi foto
            </button>
          )}
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
          {([
            { id: "light" as const, label: "🗒 Carta" },
            { id: "dark" as const, label: "🌙 Notte" },
            { id: "pink" as const, label: "🍬 Bubblegum" },
          ]).map((th) => (
            <button
              key={th.id}
              className={settings.theme === th.id ? "theme-pill on" : "theme-pill"}
              onClick={() => onChange({ ...settings, theme: th.id })}
            >
              {th.label}
            </button>
          ))}
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
        <h3>📚 Il tuo corso</h3>
        <p className="hint" style={{ marginBottom: ".7rem" }}>
          Dà il tema alle frasi motivazionali dell'app.
        </p>
        <div className="faculty-grid compact">
          {FACULTIES.map((f) => (
            <button
              key={f.id}
              className={settings.faculty === f.id ? "faculty-pill on" : "faculty-pill"}
              onClick={() => onChange({ ...settings, faculty: f.id })}
            >
              <span aria-hidden="true">{f.emoji}</span> {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card-box">
        <h3>📎 Tour guidato</h3>
        <p className="hint" style={{ marginBottom: ".7rem" }}>
          Rifai il giro dell'app con Memo, la graffetta che ti ha accolto al primo avvio.
        </p>
        <button className="ghost" onClick={onReplayTour}>Rivedi il tour</button>
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
