import { useEffect, useMemo, useRef, useState } from "react";
import {
  HABIT_LIBRARY, MOODS, EXPENSE_CATEGORIES, REWARDS, POINTS_PER, PASSIVE_INTERVAL_MS,
  budgetSummary, habitStreak, pomodoroToday, averageMood, computePoints, computeEarnedPoints, computeLevel,
  dayStr, formatMoney,
  type LifeState, type Expense, type Note,
} from "./life";
import type { ReviewEvent } from "./types";
import type { Settings } from "./types";
import { IconTimer, IconNotes, IconHabits, IconBudget, IconTrash, IconTrophy, IconGift, IconChart } from "./icons";
import { financialAdvice, ClaudeError } from "./claude";
import { aiConfigured } from "./ollama";
import { Markdown } from "./markdown";
import { IS_SOCIAL } from "./edition";

type Sub = "pomodoro" | "notes" | "habits" | "budget" | "rewards" | "finanza";
type SetLife = (updater: (l: LifeState) => LifeState) => void;

const ALL_SUBS: { id: Sub; label: string; icon: React.ReactNode }[] = [
  { id: "pomodoro", label: "Pomodoro",  icon: <IconTimer  size={14} /> },
  { id: "notes",    label: "Notes",     icon: <IconNotes  size={14} /> },
  { id: "habits",   label: "Habits",    icon: <IconHabits size={14} /> },
  { id: "budget",   label: "Budget",    icon: <IconBudget size={14} /> },
  { id: "rewards",  label: "Rewards",   icon: <IconGift   size={14} /> },
  { id: "finanza",  label: "Finanza",   icon: <IconChart  size={14} /> },
];

// The rewards are romantic promises between the two of us; the social
// edition drops the whole tab (and with it the points economy).
const SUBS = ALL_SUBS.filter((s) => !IS_SOCIAL || s.id !== "rewards");

/** Student-life hub: focus timer, notes, habits and budget in one view. */
export function LifeView({
  life,
  setLife,
  events,
  settings,
}: {
  life: LifeState;
  setLife: SetLife;
  events: ReviewEvent[];
  settings: Settings;
}) {
  const [sub, setSub] = useState<Sub>("pomodoro");

  // Passive points: every 3h the app is open, grant 50 pts
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      setLife((l) => {
        const elapsed = now - (l.lastPassiveAt ?? now);
        const blocks = Math.floor(elapsed / PASSIVE_INTERVAL_MS);
        if (blocks < 1) return l;
        return {
          ...l,
          passivePoints: l.passivePoints + blocks * POINTS_PER.passiveBlock,
          lastPassiveAt: l.lastPassiveAt + blocks * PASSIVE_INTERVAL_MS,
        };
      });
    };
    check();
    const id = window.setInterval(check, 60_000); // poll every minute
    return () => window.clearInterval(id);
  }, [setLife]);

  const points = useMemo(() => computePoints(events, life), [events, life]);
  const earned = useMemo(() => computeEarnedPoints(events, life), [events, life]);

  return (
    <main>
      <h2>Student life</h2>
      <div className="tabs">
        {SUBS.map((s) => (
          <button
            key={s.id}
            className={sub === s.id ? "tab on" : "tab"}
            onClick={() => setSub(s.id)}
            style={{ display: "inline-flex", alignItems: "center", gap: ".4rem" }}
          >
            {s.icon} {s.label}
            {s.id === "rewards" && points > 0 && (
              <span className="points-pill">{points.toLocaleString()}</span>
            )}
          </button>
        ))}
      </div>
      {sub === "pomodoro" && <Pomodoro life={life} setLife={setLife} />}
      {sub === "notes"    && <Notes    life={life} setLife={setLife} />}
      {sub === "habits"   && <Habits   life={life} setLife={setLife} />}
      {sub === "budget"   && <Budget   life={life} setLife={setLife} />}
      {sub === "rewards"  && !IS_SOCIAL && <Rewards  life={life} setLife={setLife} points={points} earned={earned} />}
      {sub === "finanza"  && <Finance  life={life} settings={settings} />}
    </main>
  );
}

/* ------------------------------ Pomodoro ------------------------------- */

function Pomodoro({ life, setLife }: { life: LifeState; setLife: SetLife }) {
  const { focusMin, breakMin } = life.settings;
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [secs, setSecs] = useState(focusMin * 60);
  const [running, setRunning] = useState(false);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    setSecs((mode === "focus" ? focusMin : breakMin) * 60);
    setRunning(false);
  }, [mode, focusMin, breakMin]);

  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          if (mode === "focus") {
            setLife((l) => ({
              ...l,
              pomodoroSessions: [...l.pomodoroSessions, { at: Date.now(), minutes: focusMin }],
            }));
            setMode("break");
          } else {
            setMode("focus");
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [running, mode, focusMin, setLife]);

  const total = (mode === "focus" ? focusMin : breakMin) * 60;
  const pct = total ? 1 - secs / total : 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const today = pomodoroToday(life.pomodoroSessions);

  const setMin = (key: "focusMin" | "breakMin", v: number) =>
    setLife((l) => ({ ...l, settings: { ...l.settings, [key]: Math.max(1, Math.min(90, v)) } }));

  return (
    <section className="card-box pomo">
      <div className="pomo-modes">
        <button className={mode === "focus" ? "tab on" : "tab"} onClick={() => setMode("focus")}>Focus</button>
        <button className={mode === "break" ? "tab on" : "tab"} onClick={() => setMode("break")}>Break</button>
      </div>
      <div className="pomo-dial" style={{ background: `conic-gradient(var(--accent) ${pct * 360}deg, var(--border-1) 0)` }}>
        <div className="pomo-time">{mm}:{ss}</div>
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="primary" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</button>
        <button className="ghost" onClick={() => { setRunning(false); setSecs(total); }}>Reset</button>
      </div>
      <div className="row pomo-settings">
        <label className="field-label">Focus</label>
        <input type="number" min={1} max={90} value={focusMin} onChange={(e) => setMin("focusMin", +e.target.value || 25)} />
        <label className="field-label">Break</label>
        <input type="number" min={1} max={30} value={breakMin} onChange={(e) => setMin("breakMin", +e.target.value || 5)} />
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        Today: <strong>{today.count}</strong> focus session{today.count === 1 ? "" : "s"} · {today.minutes} min
        {!IS_SOCIAL && <span className="pts-note"> · +{today.minutes * POINTS_PER.pomodoroMin} pts</span>}
      </p>
    </section>
  );
}

/* -------------------------------- Notes -------------------------------- */

function Notes({ life, setLife }: { life: LifeState; setLife: SetLife }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    const note: Note = { id: Math.random().toString(36).slice(2), text: t, pinned: false, createdAt: Date.now() };
    setLife((l) => ({ ...l, notes: [note, ...l.notes] }));
    setText("");
  };
  const sorted = [...life.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  return (
    <section>
      <div className="row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Quick note…" onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <button className="primary" onClick={add}>Add</button>
      </div>
      {sorted.length === 0 && <p className="empty">No notes yet.</p>}
      <div className="notes-grid">
        {sorted.map((n) => (
          <div key={n.id} className={n.pinned ? "note pinned" : "note"}>
            <p>{n.text}</p>
            <div className="note-actions">
              <button className="icon" title={n.pinned ? "Unpin" : "Pin"} onClick={() => setLife((l) => ({ ...l, notes: l.notes.map((x) => x.id === n.id ? { ...x, pinned: !x.pinned } : x) }))}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill={n.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="8" x2="8" y2="15" />
                  <path d="M5 8V4l-2-2h10L11 4v4" />
                  <line x1="3" y1="8" x2="13" y2="8" />
                </svg>
              </button>
              <button className="icon danger" title="Delete" onClick={() => setLife((l) => ({ ...l, notes: l.notes.filter((x) => x.id !== n.id) }))}>
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------- Habits & mood ----------------------------- */

function Habits({ life, setLife }: { life: LifeState; setLife: SetLife }) {
  const today = dayStr();
  const doneToday = life.checks[today] ?? [];
  const active = HABIT_LIBRARY.filter((h) => life.habits.includes(h.id));
  const todayMood = life.moodLogs.find((m) => m.date === today)?.mood ?? 0;
  const avg = averageMood(life.moodLogs);

  const toggle = (id: string) =>
    setLife((l) => {
      const cur = l.checks[today] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...l, checks: { ...l.checks, [today]: next } };
    });

  const setMood = (v: number) =>
    setLife((l) => ({
      ...l,
      moodLogs: [...l.moodLogs.filter((m) => m.date !== today), { date: today, mood: v }],
    }));

  const toggleHabit = (id: string) =>
    setLife((l) => ({
      ...l,
      habits: l.habits.includes(id) ? l.habits.filter((x) => x !== id) : [...l.habits, id],
    }));

  return (
    <section>
      <div className="card-box">
        <h3>How are you today?</h3>
        <div className="mood-row">
          {MOODS.map((m) => (
            <button
              key={m.v}
              className={todayMood === m.v ? "mood on" : "mood"}
              onClick={() => setMood(m.v)}
              title={m.label}
              style={todayMood === m.v ? { borderColor: m.color } : undefined}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <small>{m.label}</small>
            </button>
          ))}
        </div>
        {avg !== null && <p className="hint">7-day average mood: {avg.toFixed(1)} / 5</p>}
      </div>

      <div className="card-box">
        <h3>Today's habits</h3>
        <div className="habit-list">
          {active.map((h) => {
            const done = doneToday.includes(h.id);
            const isBad = h.type === "quit";
            const streak = habitStreak(life.checks, h.id);
            // Bad habits get a red "danger" style when checked (you did the bad thing)
            const cls = ["habit", done ? "done" : "", isBad && done ? "bad" : ""].filter(Boolean).join(" ");
            return (
              <button key={h.id} className={cls} onClick={() => toggle(h.id)}>
                <span className="habit-ico">{h.icon}</span>
                <span className="habit-name">
                  {h.name}
                  {isBad && <em className="quit-tag"> (avoid)</em>}
                </span>
                <span className="habit-streak" aria-label={streak > 0 ? `${streak} day streak` : undefined}>
                  {streak > 0 && <><span className="streak-dot" />{streak}</>}
                </span>
                {done && !isBad && !IS_SOCIAL && (
                  <span className="habit-pts">+{POINTS_PER.buildHabit}</span>
                )}
                <span className="habit-check">{done ? (isBad ? "✗" : "✓") : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <details className="card-box">
        <summary>Choose which habits to track</summary>
        <div className="habit-pick">
          {HABIT_LIBRARY.map((h) => (
            <label key={h.id} className={h.type === "quit" ? "pick-item bad-pick" : "pick-item"}>
              <input type="checkbox" checked={life.habits.includes(h.id)} onChange={() => toggleHabit(h.id)} />
              {h.icon} {h.name}
              {h.type === "quit" && <em className="quit-tag"> (avoid)</em>}
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}

/* ------------------------------ Rewards -------------------------------- */

const TIER_LABELS: Record<string, string> = {
  small: "Piccola gioia",
  medium: "Serata speciale",
  big: "Grande traguardo",
  dream: "Il sogno",
};

const TIER_COLORS: Record<string, string> = {
  small:  "var(--data-3)",
  medium: "var(--accent)",
  big:    "var(--p-violet-500)",
  dream:  "var(--data-2)",
};

function Rewards({
  life,
  setLife,
  points,
  earned,
}: {
  life: LifeState;
  setLife: SetLife;
  /** spendable balance (drops when a reward is redeemed). */
  points: number;
  /** lifetime career points (never drop — they drive the level). */
  earned: number;
}) {
  const { current: lvl, next: lvlNext, pct: lvlPct } = computeLevel(earned);
  const currentLevel = lvl.level;
  const nextReward = REWARDS.find((r) => !life.redeemedRewards.includes(r.id) && r.cost > points);
  const toNext = nextReward ? nextReward.cost - points : 0;

  const redeem = (id: string, cost: number, requiredLevel?: number) => {
    if (points < cost) return;
    if (requiredLevel && currentLevel < requiredLevel) return;
    setLife((l) => ({ ...l, redeemedRewards: [...l.redeemedRewards, id] }));
  };

  return (
    <section>
      {/* The vow — why these points exist at all. */}
      <div className="card-box rewards-vow">
        <span className="rewards-vow-heart" aria-hidden="true">♥</span>
        <p>
          Ogni punto che guadagni è tempo che passiamo insieme.
          <em>Riscatta un buono e mandami lo screenshot: è una promessa, e le promesse si mantengono.</em>
        </p>
      </div>

      {/* Level card */}
      <div className="card-box level-card">
        <div className="level-badge" style={{ color: lvl.color }}>Lv.{lvl.level}</div>
        <div className="level-body">
          <div className="level-name" style={{ color: lvl.color }}>{lvl.name}</div>
          {lvlNext ? (
            <>
              <div className="level-bar">
                <div className="level-fill" style={{ width: `${lvlPct * 100}%`, background: lvl.color }} />
              </div>
              <div className="level-sub">
                {(lvlNext.minPts - earned).toLocaleString()} pt per <strong>{lvlNext.name}</strong> (Lv.{lvlNext.level})
                <span className="level-career"> · carriera: {earned.toLocaleString()} pt</span>
              </div>
            </>
          ) : (
            <div className="level-sub">Livello massimo raggiunto!</div>
          )}
        </div>
      </div>

      {/* Points balance */}
      <div className="card-box reward-balance">
        <div className="reward-balance-inner">
          <IconTrophy size={28} className="trophy-icon" />
          <div>
            <div className="balance-pts">{points.toLocaleString()} <span>pt</span></div>
            <div className="balance-sub">
              {nextReward
                ? <>mancano {toNext.toLocaleString()} pt a <strong>{nextReward.name}</strong></>
                : "Hai sbloccato tutto. Ora tocca a noi. ♥"}
            </div>
          </div>
        </div>
        <div className="points-legend">
          <span>+{POINTS_PER.pomodoroMin}/min di focus</span>
          <span>+{POINTS_PER.cardCorrect} carta giusta</span>
          <span>+{POINTS_PER.buildHabit} buona abitudine</span>
          <span>+{POINTS_PER.passiveBlock} ogni 3h di app aperta</span>
        </div>
      </div>

      {/* Reward cards */}
      <div className="rewards-grid">
        {REWARDS.map((r) => {
          const redeemed = life.redeemedRewards.includes(r.id);
          const canAfford = points >= r.cost;
          const levelOk = !r.requiredLevel || currentLevel >= r.requiredLevel;
          const isAvailable = canAfford && levelOk && !redeemed;
          return (
            <div
              key={r.id}
              className={`reward-card tier-${r.tier}${redeemed ? " redeemed" : ""}${isAvailable ? " unlocked" : ""}`}
            >
              <div className="reward-tier-badge" style={{ color: TIER_COLORS[r.tier] }}>
                {TIER_LABELS[r.tier]}
              </div>
              <div className="reward-name">{r.name}</div>
              <div className="reward-desc">{r.desc}</div>
              {r.requiredLevel && r.requiredLevel > 1 && (
                <div className="reward-level-req" style={{ color: levelOk ? TIER_COLORS[r.tier] : "var(--fg-subtle)" }}>
                  Lv.{r.requiredLevel} richiesto
                </div>
              )}
              <div className="reward-footer">
                <span className="reward-cost" style={{ color: canAfford ? TIER_COLORS[r.tier] : "var(--fg-subtle)" }}>
                  {r.cost.toLocaleString()} pt
                </span>
                {redeemed ? (
                  <span className="reward-claimed">Riscattato ♥</span>
                ) : !levelOk ? (
                  <button className="ghost small" disabled>
                    Lv.{r.requiredLevel} richiesto
                  </button>
                ) : (
                  <button
                    className={canAfford ? "primary small" : "ghost small"}
                    disabled={!canAfford}
                    title={canAfford ? "Riscatta il buono" : `Mancano ${(r.cost - points).toLocaleString()} pt`}
                    onClick={() => redeem(r.id, r.cost, r.requiredLevel)}
                  >
                    {canAfford ? "Riscatta" : `−${(r.cost - points).toLocaleString()} pt`}
                  </button>
                )}
              </div>
              <span className="reward-watermark" aria-hidden="true">♥</span>
              {isAvailable && <div className="reward-glow" style={{ background: TIER_COLORS[r.tier] }} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ Finance -------------------------------- */

function Finance({ life, settings }: { life: LifeState; settings: Settings }) {
  const [income, setIncome] = useState(1200);
  const [risk, setRisk] = useState<"basso" | "medio" | "alto">("medio");
  const [advice, setAdvice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sum = useMemo(() => budgetSummary(life.expenses, life.settings.monthlyBudget), [life]);
  const estimatedSavings = Math.max(0, income - sum.spent);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setAdvice(await financialAdvice(settings, income, sum.budget, sum.spent, risk));
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : "Qualcosa è andato storto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div className="card-box">
        <h3>Situazione finanziaria</h3>
        <div className="finance-stats">
          <div className="finance-stat">
            <span className="fstat-label">Budget spese/mese</span>
            <span className="fstat-val">{formatMoney(sum.budget)}</span>
          </div>
          <div className="finance-stat">
            <span className="fstat-label">Spese questo mese</span>
            <span className="fstat-val">{formatMoney(sum.spent)}</span>
          </div>
          <div className="finance-stat highlight">
            <span className="fstat-label">Risparmio stimato</span>
            <span className="fstat-val" style={{ color: "var(--ok)" }}>{formatMoney(estimatedSavings)}</span>
          </div>
        </div>

        <div className="finance-inputs">
          <div className="field-row">
            <label className="field-label">Reddito mensile netto</label>
            <div className="row" style={{ gap: ".4rem" }}>
              <span className="euro-sign">€</span>
              <input type="number" min={0} value={income}
                onChange={(e) => setIncome(Math.max(0, +e.target.value))}
                style={{ width: 100 }} />
            </div>
          </div>
          <div className="field-row">
            <label className="field-label">Propensione al rischio</label>
            <select value={risk} onChange={(e) => setRisk(e.target.value as "basso" | "medio" | "alto")}>
              <option value="basso">Basso — dormire tranquillo</option>
              <option value="medio">Medio — equilibrio rischio/rendimento</option>
              <option value="alto">Alto — massimizzare rendimenti</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: "1rem" }}>
          <button className="primary" disabled={loading || !aiConfigured(settings) || income <= 0} onClick={run}>
            {loading ? "Analisi in corso…" : "Ricevi consigli"}
          </button>
          {!aiConfigured(settings) && (
            <span className="hint" style={{ fontSize: ".8rem" }}>Hai scelto Claude come motore IA: serve la chiave nel Profilo</span>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {advice && <Markdown text={advice} className="ai-output md" />}
    </section>
  );
}

/* -------------------------------- Budget ------------------------------- */

function Budget({ life, setLife }: { life: LifeState; setLife: SetLife }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[1]);
  const [note, setNote] = useState("");
  const sum = useMemo(() => budgetSummary(life.expenses, life.settings.monthlyBudget), [life]);
  const overspent = sum.remaining < 0;

  const add = () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) return;
    const e: Expense = { id: Math.random().toString(36).slice(2), date: dayStr(), amount: a, category, note: note.trim() };
    setLife((l) => ({ ...l, expenses: [e, ...l.expenses] }));
    setAmount("");
    setNote("");
  };

  return (
    <section>
      <div className="card-box">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>This month</h3>
          <div className="row">
            <label className="field-label">Budget</label>
            <input
              type="number" min={0} value={life.settings.monthlyBudget} style={{ width: 90 }}
              onChange={(e) => setLife((l) => ({ ...l, settings: { ...l.settings, monthlyBudget: +e.target.value || 0 } }))}
            />
          </div>
        </div>
        <p className="budget-line">
          Spent <strong>{formatMoney(sum.spent)}</strong> ·{" "}
          <span className={overspent ? "conf-low" : "conf-high"}>
            {overspent ? `over by ${formatMoney(-sum.remaining)}` : `${formatMoney(sum.remaining)} left`}
          </span>
        </p>
        <div className="budget-bar">
          <div
            className="budget-fill"
            style={{
              width: `${Math.min(100, sum.budget ? (sum.spent / sum.budget) * 100 : 0)}%`,
              background: overspent ? "var(--err)" : "var(--accent)",
            }}
          />
        </div>
        {sum.byCategory.length > 0 && (
          <ul className="cat-list">
            {sum.byCategory.map((c) => (
              <li key={c.category}><span>{c.category}</span><span>{formatMoney(c.amount)}</span></li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-box">
        <h3>Add expense</h3>
        <div className="row">
          <input type="number" placeholder="€" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 90 }} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
          <button className="primary" onClick={add}>Add</button>
        </div>
      </div>

      {life.expenses.length > 0 && (
        <ul className="expense-list">
          {life.expenses.slice(0, 30).map((e) => (
            <li key={e.id}>
              <span className="exp-cat">{e.category}</span>
              <span className="exp-note">{e.note || "—"}</span>
              <span className="exp-date">{e.date.slice(5)}</span>
              <strong>{formatMoney(e.amount)}</strong>
              <button className="icon danger" onClick={() => setLife((l) => ({ ...l, expenses: l.expenses.filter((x) => x.id !== e.id) }))}>
                <IconTrash size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
