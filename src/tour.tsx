/**
 * tour.tsx — the first-launch guided tour.
 *
 * Coach-marks done the quiet way: a dimmed veil with a soft spotlight that
 * *glides* from one UI element to the next (one absolutely-positioned div
 * with a huge box-shadow — the classic spotlight trick — animated via CSS
 * transitions), a floating card anchored next to the highlighted element,
 * and Graffetta 📎, the paperclip guide, walking you through every tab.
 *
 * Deliberately non-skippable but short: seven stops, ~two minutes. The tour
 * actually navigates the app while it talks, so by the end the user has
 * SEEN every area, not read about it. Runs once (localStorage flag);
 * replayable from Profile → "Rivedi il tour".
 */

import { useEffect, useRef, useState } from "react";
import { IS_SOCIAL, APP_NAME } from "./edition";

const TOUR_KEY = "memora:tour:v1:done";

export function tourPending(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === null;
  } catch {
    return false;
  }
}

export function resetTour(): void {
  try { localStorage.removeItem(TOUR_KEY); } catch { /* ignore */ }
}

function markTourDone(): void {
  try { localStorage.setItem(TOUR_KEY, String(Date.now())); } catch { /* ignore */ }
}

/* ─── Graffetta, the paperclip guide ─────────────────────────────────────── */

/**
 * A hand-drawn paperclip with a face. The inner/outer loops are two stroke
 * paths; eyes blink and the whole clip floats via CSS (.tour-mascot).
 */
export function Graffetta({ size = 84 }: { size?: number }) {
  return (
    <svg
      className="tour-mascot"
      width={size}
      height={size * 1.25}
      viewBox="0 0 80 100"
      fill="none"
      aria-hidden="true"
    >
      {/* outer loop */}
      <path
        d="M 22 88 L 22 26 C 22 10 58 10 58 26 L 58 74 C 58 86 34 86 34 74 L 34 34"
        stroke="var(--accent)"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      {/* face on the top bend */}
      <g className="tour-mascot-face">
        <circle cx="33" cy="27" r="3.6" fill="var(--fg-base)" className="tour-mascot-eye" />
        <circle cx="47" cy="27" r="3.6" fill="var(--fg-base)" className="tour-mascot-eye" />
        <path d="M 33 36 Q 40 43 47 36" stroke="var(--fg-base)" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="26.5" cy="33" r="3" fill="var(--accent)" opacity=".35" />
        <circle cx="53.5" cy="33" r="3" fill="var(--accent)" opacity=".35" />
      </g>
    </svg>
  );
}

/* ─── steps ──────────────────────────────────────────────────────────────── */

export type TourTab = "decks" | "dashboard" | "life" | "groups" | "ai" | "settings";

interface TourStep {
  /** value of the [data-tour] attribute to spotlight; null → centered step. */
  target: string | null;
  /** tab to navigate to while this step shows. */
  tab: TourTab | null;
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    target: null, tab: null,
    title: `Benvenuta in ${APP_NAME}!`,
    text: "Sono Graffetta, la tua guida. Ti faccio fare un giro veloce — due minuti, promesso, e poi non mi vedi più.",
  },
  {
    target: "decks", tab: "decks",
    title: "I tuoi mazzi",
    text: "Qui vivono le flashcard. Non le ripassi a caso: l'algoritmo te le ripropone proprio quando stai per dimenticarle.",
  },
  {
    target: "dashboard", tab: "dashboard",
    title: "I tuoi progressi",
    text: "Serie di giorni, precisione, previsioni: qui vedi il tuo studio crescere, grafico dopo grafico.",
  },
  {
    target: "life", tab: "life",
    title: "La vita da studente",
    text: IS_SOCIAL
      ? "Timer Pomodoro per il focus, abitudini, umore e budget: la parte di studio che non è studio."
      : "Timer Pomodoro, abitudini, umore, budget… e i premi: ogni punto guadagnato è tempo passato insieme. ♥",
  },
  {
    target: "groups", tab: "groups",
    title: "Studiare in compagnia",
    text: "Crea un gruppo e invita chi vuoi con un solo link: chat con GIF e sticker, eventi sul calendario e la classifica mensile del gruppo.",
  },
  {
    target: "ai", tab: "ai",
    title: "Il motore IA",
    text: "Dagli un PDF o gli appunti e ti prepara flashcard, riassunti ed esami di prova. Gira sul tuo computer: gratis e privato.",
  },
  {
    target: "support", tab: "settings",
    title: "E se serve aiuto…",
    text: "Da qui ci scrivi direttamente: problemi, idee, proposte. Ora tocca a te — buono studio! ✨",
  },
];

/* ─── the tour ───────────────────────────────────────────────────────────── */

export function GuidedTour({
  onNavigate,
  onDone,
}: {
  onNavigate: (tab: TourTab) => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[index];
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  /* Navigate the real app as the tour advances, then measure the target once
     the view has settled. Remeasure on resize so the spotlight stays glued. */
  useEffect(() => {
    if (step.tab) navigateRef.current(step.tab);
    const measure = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    // Twice: once when the view has likely rendered, once after any layout
    // shifts (scroll reveals, fonts) have settled.
    const t1 = setTimeout(measure, 140);
    const t2 = setTimeout(measure, 600);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", measure); };
  }, [step]);

  const last = index === STEPS.length - 1;
  const next = () => {
    if (last) { markTourDone(); onDone(); }
    else setIndex((i) => i + 1);
  };

  const PAD = 6;
  const spot = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  /* Card next to the spotlight (nav lives on the left, so the card goes
     right of it), clamped to the viewport; centered when there's no target. */
  const CARD_W = 360;
  const cardStyle: React.CSSProperties = spot
    ? {
        top: Math.max(16, Math.min(spot.top - 10, window.innerHeight - 260)),
        left: Math.min(spot.left + spot.width + 18, window.innerWidth - CARD_W - 16),
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Tour guidato">
      {/* the veil: one spotlight div whose box-shadow dims everything else */}
      {spot ? (
        <div
          className="tour-spotlight"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div className="tour-card" style={cardStyle} key={index}>
        <div className="tour-card-mascot"><Graffetta /></div>
        <div className="tour-card-body">
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <div className="tour-footer">
            <div className="tour-dots" aria-label={`Passo ${index + 1} di ${STEPS.length}`}>
              {STEPS.map((_, i) => (
                <span key={i} className={i === index ? "tour-dot on" : "tour-dot"} />
              ))}
            </div>
            <div className="tour-buttons">
              {index > 0 && (
                <button className="ghost small" onClick={() => setIndex((i) => i - 1)}>
                  Indietro
                </button>
              )}
              <button className="primary small" onClick={next} autoFocus>
                {last ? "Inizia! ✨" : "Avanti"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
