/**
 * motivation.ts — le frasi che tengono compagnia mentre si studia.
 *
 * Two pools: universal phrases (anti performance-anxiety, growth mindset)
 * and per-faculty pools themed on the user's degree family (from the
 * first-launch mini questionnaire) — a med student reads different words
 * than a law student, and the app feels tailored, not generic.
 *
 * Selection is deterministic per day (the "phrase of the day" doesn't
 * flicker on re-render) and random-ish at session end. Pure module, tested
 * in motivation.test.ts.
 */

/* ─── faculties (questionnaire options) ──────────────────────────────────── */

export interface FacultyOption {
  id: string;
  label: string;
  emoji: string;
}

/** Mirrors engine.ts StudySubject families + "altro" for everyone else. */
export const FACULTIES: FacultyOption[] = [
  { id: "psicologia",     label: "Psicologia",              emoji: "🧠" },
  { id: "giurisprudenza", label: "Giurisprudenza",          emoji: "⚖️" },
  { id: "medicina",       label: "Medicina e Sanità",       emoji: "🩺" },
  { id: "matematica",     label: "Matematica e Fisica",     emoji: "📐" },
  { id: "informatica",    label: "Informatica e Ingegneria", emoji: "💻" },
  { id: "economia",       label: "Economia e Management",   emoji: "📊" },
  { id: "scienze",        label: "Scienze (Bio/Chimica)",   emoji: "🧬" },
  { id: "lingue",         label: "Lingue straniere",        emoji: "🌍" },
  { id: "umanistiche",    label: "Materie umanistiche",     emoji: "🏛️" },
  { id: "altro",          label: "Altro / non all'università", emoji: "✨" },
];

/* ─── the phrase bank ────────────────────────────────────────────────────── */

export const GENERIC_PHRASES: string[] = [
  "Non sei i tuoi voti. Sei la persona che si è seduta a studiare oggi.",
  "Continua così: ce la puoi fare, e lo stai già dimostrando.",
  "Ogni ripasso è un mattone. Nessuno vede il muro finché non è alto.",
  "La costanza batte il talento, quando il talento non è costante.",
  "Anche cinque minuti contano. Soprattutto i cinque minuti in cui non ne avevi voglia.",
  "Il voto misura una prova, non il tuo valore.",
  "Chi è davanti a te non è più intelligente: ha solo ripassato ieri. Come stai facendo tu ora.",
  "Studiare stanchi vale doppio, ma riposare non è tradire lo studio.",
  "Non devi essere perfetta oggi. Devi solo essere qui.",
  "La sessione passa. Quello che impari resta.",
  "Un capitolo alla volta si finiscono anche i manuali più cattivi.",
  "Sbagliare una card adesso è il modo migliore di non sbagliarla all'esame.",
];

export const FACULTY_PHRASES: Record<string, string[]> = {
  psicologia: [
    "Rinforzo positivo: hai aperto l'app. Comportamento da consolidare. 🧠",
    "Anche Festinger avrebbe un po' di dissonanza prima di un esame. È normale.",
    "La curva dell'oblio di Ebbinghaus perde contro di te, un ripasso alla volta.",
    "Autoefficacia (Bandura, 1977): la stai costruendo adesso, card dopo card.",
  ],
  giurisprudenza: [
    "Nessuna sentenza ti definisce: c'è sempre appello. Anche per gli esami.",
    "Articolo dopo articolo, anche il codice più lungo finisce.",
    "Dura lex, sed lex: ma la pausa caffè è un diritto inderogabile.",
    "Anche in Cassazione hanno iniziato dal primo esame di Privato.",
  ],
  medicina: [
    "Ogni nozione che fissi oggi è un paziente che domani ringrazia.",
    "Anche l'anatomia si impara un osso alla volta. Sono 206, non infinite.",
    "First-line therapy per l'ansia da esame: un ripasso adesso, riposo stanotte.",
    "Il camice ti aspetta. Oggi basta una pagina in più di ieri.",
  ],
  matematica: [
    "Ogni dimostrazione sembrava impossibile, finché qualcuno non l'ha capita. Tocca a te.",
    "Per induzione: se hai studiato oggi, puoi studiare anche domani.",
    "Gli errori di segno capitano ai migliori. I migliori li trovano al ripasso.",
    "La soluzione elegante arriva al terzo tentativo. Sei in ottima media.",
  ],
  informatica: [
    "Anche tu, come il codice: compili meglio dopo un refactoring e una pausa.",
    "Il cervello è l'unico sistema che migliora con i crash. Ripassa e riavvia.",
    "Debug della memoria in corso: ogni card sbagliata è un bug trovato in tempo.",
    "Nessuno scrive codice perfetto al primo colpo. Nessuno impara al primo ripasso.",
  ],
  economia: [
    "Lo studio è l'investimento col rendimento composto più alto. Stai capitalizzando.",
    "Il costo opportunità di questo ripasso? Molto più basso del rimpianto.",
    "Domanda e offerta: l'esame chiede, tu tra poco offri. Equilibrio.",
    "Anche i mercati hanno giornate rosse. Poi rimbalzano, come te.",
  ],
  scienze: [
    "Anche le reazioni più lente arrivano a compimento. Con il giusto catalizzatore: tu.",
    "Ogni pathway si impara passo dopo passo, come lo percorre la cellula.",
    "L'evoluzione premia chi si adatta: un ripasso oggi è puro vantaggio selettivo.",
    "La scienza è fatta di tentativi. Anche il tuo studio può esserlo.",
  ],
  lingue: [
    "Ogni parola nuova è un ponte. Ne stai costruendo una città.",
    "Sbagliare una collocazione oggi = non dimenticarla mai più.",
    "Fluente non si nasce: si ripassa. Word by word, giorno per giorno.",
    "Anche i madrelingua hanno imparato una parola alla volta.",
  ],
  umanistiche: [
    "Anche la storia si è fatta un giorno alla volta. Come il tuo programma.",
    "Ogni autore che fissi oggi è una citazione che domani ti salva.",
    "Le grandi opere sono lunghe. Le sessioni di studio, per fortuna, no.",
    "Contesto, cause, conseguenze: funziona per la storia e per gli esami.",
  ],
  altro: [
    "Qualunque cosa tu stia imparando, oggi le hai dato spazio. Conta.",
    "Il percorso non standard è comunque un percorso. E lo stai percorrendo.",
  ],
};

/* ─── selection ──────────────────────────────────────────────────────────── */

function pool(faculty?: string): string[] {
  const themed = faculty ? FACULTY_PHRASES[faculty] ?? [] : [];
  return [...GENERIC_PHRASES, ...themed];
}

/** Stable "phrase of the day": same phrase all day, changes at midnight. */
export function dailyPhrase(faculty: string | undefined, now: number = Date.now()): string {
  const d = new Date(now);
  const daySeed = d.getFullYear() * 400 + (d.getMonth() + 1) * 31 + d.getDate();
  const p = pool(faculty);
  // Faculty phrases get a fair rotation: cycle the combined pool by day.
  return p[daySeed % p.length];
}

/** Session-end encouragement: varies per call, biased toward themed phrases. */
export function sessionPhrase(faculty: string | undefined, rand: number = Math.random()): string {
  const themed = faculty ? FACULTY_PHRASES[faculty] ?? [] : [];
  // 50/50 themed vs generic when themed phrases exist — personalization
  // should be felt, not rare.
  if (themed.length > 0 && rand < 0.5) {
    return themed[Math.floor((rand * 2) * themed.length) % themed.length];
  }
  const g = GENERIC_PHRASES;
  return g[Math.floor(rand * g.length) % g.length];
}
