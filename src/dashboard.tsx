import { useMemo } from "react";
import type { Deck, ReviewEvent } from "./types";
import {
  dailyStats,
  streak,
  retention,
  dueForecast,
  easeHistogram,
  predictGrade,
  summary,
} from "./stats";
import { reputation } from "./score";
import { detectMoments, describeMoment } from "./moments";
import { useT, type TFn } from "./i18n";
import { LineChart, BarChart } from "./charts";

/** The progress dashboard — all derived from decks + the review-event log. */
export function Dashboard({
  decks,
  events,
}: {
  decks: Deck[];
  events: ReviewEvent[];
}) {
  const t = useT();
  const now = Date.now();
  const sum = useMemo(() => summary(decks, events, now), [decks, events, now]);
  const stk = useMemo(() => streak(events, now), [events, now]);
  const pred = useMemo(() => predictGrade(decks, events, now), [decks, events, now]);
  const forecast = useMemo(() => dueForecast(decks, now, 7), [decks, now]);
  const ease = useMemo(() => easeHistogram(decks), [decks]);
  const rep = useMemo(() => reputation(decks, events, now), [decks, events, now]);
  // The Diario di Bordo: notable moments, newest first, most recent 16.
  const journal = useMemo(() => detectMoments(events, now).slice(-16).reverse(), [events, now]);

  // Accuracy over the last 14 active days.
  const accuracySeries = useMemo(() => {
    const ds = dailyStats(events).slice(-14);
    return ds.map((d) => ({ label: d.day.slice(5), value: d.accuracy }));
  }, [events]);

  // Reviews per day over the last 14 active days.
  const reviewsSeries = useMemo(() => {
    const ds = dailyStats(events).slice(-14);
    return ds.map((d) => ({ label: d.day.slice(5), value: d.reviews }));
  }, [events]);

  const ret = retention(events, now);
  const weekday = (k: string) =>
    new Date(k + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });

  return (
    <main className="dashboard">
      <h2>{t("dash.title")}</h2>

      <div className="stat-row">
        <StatCard label={t("dash.streak")} value={stk.current} sub={stk.current > 0 ? t("dash.best", { n: stk.longest }) : t("dash.startToday")} className="reveal" />
        <StatCard label={t("dash.cards")}  value={sum.totalCards}   sub={t("dash.due", { n: sum.dueNow })} className="reveal" />
        <StatCard label={t("dash.reviews")} value={sum.totalReviews} sub={t("dash.today", { n: sum.reviewsToday })} className="reveal" />
        <StatCard
          label={t("dash.accuracy")}
          value={ret === null ? "—" : `${Math.round(ret * 100)}%`}
          sub={t("dash.last30")}
          className="reveal"
        />
      </div>

      <section className="rep-panel">
        <div className="rep-head">
          <h3>{t("rep.title")}</h3>
          <span className="rep-sub">{t("rep.sub")}</span>
        </div>
        <div className="rep-grid">
          <RepAxis
            label={t("rep.mastery")}
            value={rep.mastery}
            suffix="/100"
            fill={rep.mastery}
            color="var(--accent)"
            hint={t("rep.masteryHint")}
          />
          <RepAxis
            label={t("rep.progress")}
            value={rep.progress}
            suffix="/100"
            fill={rep.progress}
            color={rep.progress > 50 ? "var(--ok)" : rep.progress < 50 ? "var(--warn)" : "var(--accent)"}
            hint={rep.progress > 50 ? t("rep.up") : rep.progress < 50 ? t("rep.down") : t("rep.stable")}
          />
          <RepAxis
            label={t("rep.effort")}
            value={rep.effort}
            suffix=" pt"
            color="var(--ok)"
            hint={t("rep.effortHint")}
          />
        </div>
      </section>

      <section className="journal card-box">
        <h3>{t("journal.title")}</h3>
        {journal.length === 0 ? (
          <p className="hint">{t("journal.empty")}</p>
        ) : (
          <ul className="journal-list">
            {journal.map((m, i) => (
              <li key={`${m.at}-${m.kind}-${i}`} className={`journal-item tone-${m.tone}`}>
                <span className="journal-dot" />
                <span className="journal-text">{describeMoment(m, t)}</span>
                <span className="journal-when">{timeAgo(now - m.at, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="predict card-box">
        <div className="predict-score">
          <span className="big-score">{pred.score}</span>
          <span className="out-of">/ 100</span>
        </div>
        <div className="predict-text">
          <strong>Predicted exam score</strong>
          <p>
            Based on {Math.round(pred.retention * 100)}% recall and{" "}
            {Math.round(pred.coverage * 100)}% of cards well-learned.{" "}
            <span className={`conf conf-${pred.confidence}`}>{pred.confidence} confidence</span>
          </p>
          <small>An estimate to motivate you — keep your accuracy and coverage up to raise it.</small>
        </div>
      </section>

      <div className="chart-grid">
        <div className="card-box">
          <h3>Accuracy over time</h3>
          <LineChart data={accuracySeries} />
        </div>
        <div className="card-box">
          <h3>Reviews per day</h3>
          <BarChart data={reviewsSeries} color="var(--data-2)" />
        </div>
        <div className="card-box">
          <h3>Due in the next 7 days</h3>
          <BarChart
            data={forecast.map((f, i) => ({
              label: i === 0 ? "today" : weekday(f.day),
              value: f.count,
            }))}
            color="var(--data-4)"
          />
        </div>
        <div className="card-box">
          <h3>Card difficulty</h3>
          <BarChart
            data={ease.map((b) => ({ label: b.label, value: b.count }))}
            color="var(--g-green)"
          />
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`stat-card ${className}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

/** One reputation axis: a headline number, an optional 0..100 bar, and a hint. */
function RepAxis({
  label,
  value,
  suffix,
  fill,
  color,
  hint,
}: {
  label: string;
  value: number;
  suffix: string;
  fill?: number;
  color: string;
  hint: string;
}) {
  return (
    <div className="rep-axis">
      <span className="rep-axis-label">{label}</span>
      <span className="rep-axis-value">
        {value}
        <small>{suffix}</small>
      </span>
      {fill !== undefined && (
        <div className="rep-bar">
          <span style={{ width: `${Math.max(0, Math.min(100, fill))}%`, background: color }} />
        </div>
      )}
      <span className="rep-axis-hint">{hint}</span>
    </div>
  );
}

/** Compact, localised "time ago" for diary entries. */
function timeAgo(deltaMs: number, t: TFn): string {
  const d = Math.floor(deltaMs / 86_400_000);
  if (d <= 0) return t("time.today");
  if (d === 1) return t("time.yesterday");
  if (d < 7) return t("time.daysAgo", { n: d });
  const w = Math.floor(d / 7);
  return w === 1 ? t("time.weekAgo") : t("time.weeksAgo", { n: w });
}
