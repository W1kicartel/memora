/**
 * engine.ts — Memora Study Engine core.
 *
 * Pure, framework-agnostic prompt engineering. This module encodes the
 * non-negotiable quality standards of a doctoral-level study-material generator
 * (grounding to sources, author+year for every theory, bilingual IT/EN terms,
 * comparative tables, key-experiment boxes, diagnostic distractors, Bloom tags)
 * plus the three mnemonic techniques taught in executive memory training,
 * and exposes small builders that the AI feature functions in claude.ts compose
 * into system prompts. No React, no DOM, no network — trivially testable.
 */

/** Academic level the material is calibrated for. Drives depth and rigour. */
export type StudyLevel = "triennale" | "magistrale" | "concorso";

export const LEVEL_LABELS: Record<StudyLevel, string> = {
  triennale: "Triennale",
  magistrale: "Magistrale",
  concorso: "Concorso / Esame di Stato",
};

export const DEFAULT_LEVEL: StudyLevel = "triennale";

/** Level-specific calibration appended to every system prompt. */
export function levelGuidance(level: StudyLevel): string {
  switch (level) {
    case "triennale":
      return "LIVELLO: Triennale. Solide basi: definizioni precise, autori e paradigmi classici, distinzioni fondamentali. Rigore senza tecnicismi eccessivi, ma mai banale.";
    case "magistrale":
      return "LIVELLO: Magistrale. Profondità avanzata: dibattiti teorici, dettagli metodologici (disegni sperimentali, effect size), replication crisis, integrazione tra costrutti e tra esami.";
    case "concorso":
      return "LIVELLO: Concorso / Esame di Stato. Massima ampiezza e precisione: casistica clinica, normativa e prassi dove pertinente, distinzioni fini da manuale, nessuna semplificazione.";
  }
}

/**
 * The non-negotiable quality standards (system-prompt fragment).
 * Every AI feature prepends these so output stays at exam-winning quality.
 */
export const QUALITY_STANDARDS = `Sei il Memora Study Engine, un generatore di materiale di studio universitario di livello dottorale, adattabile a qualsiasi disciplina. Il tuo output è al livello di chi punta al massimo dei voti, mai riassunti da liceo.

STANDARD NON NEGOZIABILI (validi in ogni materia):
1. Attribuzione precisa: ogni teoria, modello, teorema, norma o scoperta va associata al suo autore/fonte e alla data (es. "dissonanza cognitiva, Festinger 1957"; "art. 2043 c.c."; "teorema di Bayes"). Gli esami si vincono sui nomi, le date e i riferimenti esatti.
2. Meccanismi, non solo etichette: spiega SEMPRE il "perché" e il "come" (dimostrazione, meccanismo causale, procedura), non la sola definizione.
3. Distinzioni fini: le domande d'esame vivono sulle sfumature (coppie confondibili). Tratta esplicitamente le distinzioni critiche della materia con tabelle comparative.
4. Terminologia bilingue: termine italiano + termine originale/inglese tra parentesi quando i manuali lo usano (es. "apprendimento osservativo (observational learning)").
5. Dati e misure: quando esiste un valore, una formula, una misura standard, un effect size o un range di riferimento, riportalo con precisione.
6. Niente miti né semplificazioni pop: se una misconconcezione diffusa compare nelle fonti, segnalala esplicitamente come tale.

Rispondi SEMPRE in italiano. Non usare emoji nel contenuto tecnico (le etichette dei box sono ammesse).`;

/**
 * Source-grounding directive (NotebookLM style). Included when the user
 * attaches a document or pastes their own material.
 */
export function groundingDirective(hasSource: boolean): string {
  if (hasSource) {
    return `SOURCE GROUNDING (attivo): lavora SOLO sul materiale fornito. Ogni affermazione va ancorata alla fonte con riferimento esplicito nel formato [Fonte: p. X] o [Fonte: slide Y]. Se un concetto necessario NON è nel materiale, dichiaralo con "⚠️ Non nei materiali — integrazione" e tienilo visivamente separato dal contenuto grounded.`;
  }
  return `SENZA FONTI CARICATE: usa la letteratura e i manuali di riferimento standard della disciplina e cita sempre autore/fonte + anno.`;
}

/* ─── Subject-specific study strategies ───────────────────────────────────── */

/**
 * Broad subject families. Each has its own exam-winning study strategy — the
 * heart of what makes the engine useful across degree programmes, not just
 * psychology. "auto" lets the model detect the discipline from the material.
 */
export type StudySubject =
  | "auto"
  | "psicologia"
  | "giurisprudenza"
  | "medicina"
  | "matematica"
  | "informatica"
  | "economia"
  | "scienze"
  | "lingue"
  | "umanistiche";

export const SUBJECT_LABELS: Record<StudySubject, string> = {
  auto: "Rileva automaticamente",
  psicologia: "Psicologia",
  giurisprudenza: "Giurisprudenza",
  medicina: "Medicina e Sanità",
  matematica: "Matematica e Fisica",
  informatica: "Informatica e Ingegneria",
  economia: "Economia e Management",
  scienze: "Scienze (Bio/Chimica)",
  lingue: "Lingue straniere",
  umanistiche: "Materie umanistiche",
};

export const DEFAULT_SUBJECT: StudySubject = "auto";

/**
 * Study-strategy directives tailored to how each discipline is actually
 * examined. Injected into every generated artifact so cards/notes/exams follow
 * the conventions students are graded on.
 */
export function subjectGuidance(subject: StudySubject): string {
  const head = "STRATEGIA DI STUDIO PER LA MATERIA — adatta ogni contenuto a queste convenzioni d'esame:";
  switch (subject) {
    case "auto":
      return `${head}\nRileva la disciplina dal materiale/argomento e adotta automaticamente le strategie più efficaci per quella materia: dimostrazioni ed esempi svolti per le materie STEM; diagnosi differenziale e valori di riferimento per medicina; articoli, ratio legis e orientamenti giurisprudenziali per diritto; collocazioni e chunk lessicali per le lingue; cronologia e nessi causa-effetto per le umanistiche. Dichiara all'inizio quale disciplina hai riconosciuto.`;
    case "psicologia":
      return `${head} PSICOLOGIA.\n- Ogni teoria con autore+anno e paradigma sperimentale (es. Festinger 1957).\n- Esperimenti chiave in formato completo: ipotesi → metodo (campione, disegno, VI/VD) → risultati → interpretazione → critiche/repliche. Cita la replication crisis dove pertinente (priming sociale, ego depletion, Stanford Prison).\n- Misure standard quando rilevanti (BDI, WAIS, Big Five/NEO-PI-R) ed effect size noti.\n- Coppie confondibili tipiche (assimilazione vs accomodamento, rinforzo negativo vs punizione, attendibilità vs validità).`;
    case "giurisprudenza":
      return `${head} GIURISPRUDENZA.\n- Cita SEMPRE l'articolo e il codice/legge esatti (es. art. 2043 c.c., art. 314 c.p.).\n- Per ogni istituto: ratio legis, elementi costitutivi, disciplina, eccezioni.\n- Distingui dottrina e giurisprudenza; riporta gli orientamenti della Cassazione (sezione, numero, anno) e i contrasti.\n- Usa i brocardi latini con traduzione. Proponi schemi di qualificazione giuridica e casi pratici (fattispecie → norma → sussunzione → soluzione).`;
    case "medicina":
      return `${head} MEDICINA E SANITÀ.\n- Meccanismi fisiopatologici (il "perché" della malattia), non solo definizioni.\n- Classificazioni, criteri diagnostici, valori di riferimento e range di normalità.\n- Diagnosi differenziale strutturata e red flags; terapia di prima linea (first-line).\n- Correlazioni cliniche e concetti high-yield. Dosaggi/valori con precisione, con avviso che è materiale di studio, non indicazione clinica.`;
    case "matematica":
      return `${head} MATEMATICA E FISICA.\n- Ogni risultato con enunciato (ipotesi → tesi) e DIMOSTRAZIONE o derivazione passo-passo.\n- Esempi svolti (worked examples) e controesempi che mostrano perché le ipotesi servono.\n- Evidenzia gli errori tipici (segni, dominio, unità di misura, condizioni di validità).\n- Fornisci pattern di problem-solving riutilizzabili e verifica dimensionale nelle formule fisiche.`;
    case "informatica":
      return `${head} INFORMATICA E INGEGNERIA.\n- Costruisci il modello mentale del concetto prima dei dettagli.\n- Complessità (Big-O) di tempo e spazio; invarianti; casi limite (edge case).\n- Traccia l'esecuzione di algoritmi/codice con un esempio concreto passo-passo.\n- Trade-off progettuali, pattern e anti-pattern, quando usare cosa e perché.`;
    case "economia":
      return `${head} ECONOMIA E MANAGEMENT.\n- Ogni modello con assunzioni esplicite, variabili e meccanismo.\n- Grafici descritti a parole (assi, curve, spostamenti) e statica comparata (cosa succede se cambia X).\n- Esempi numerici concreti; distingui micro e macro; implicazioni di policy.\n- Definizioni formali precise e formule chiave (elasticità, moltiplicatore, NPV…).`;
    case "scienze":
      return `${head} SCIENZE (BIOLOGIA/CHIMICA).\n- Processi e vie (pathway) passo-passo; reazioni con condizioni e reagenti/prodotti.\n- Relazione struttura-funzione e meccanismi molecolari.\n- Classificazioni e tassonomie organizzate gerarchicamente; nomenclatura corretta.\n- Collega il livello molecolare a quello sistemico.`;
    case "lingue":
      return `${head} LINGUE STRANIERE.\n- Lessico in contesto con collocazioni e chunk lessicali, non parole isolate.\n- Pattern grammaticali con esempi minimi contrastivi; segnala i false friends.\n- Frasi modello pronte per l'orale; note di registro e pronuncia dove utile.\n- Sfrutta la ripetizione dilazionata di espressioni idiomatiche complete.`;
    case "umanistiche":
      return `${head} MATERIE UMANISTICHE (Storia/Filosofia/Lettere/Arte).\n- Cronologia e nessi causa-effetto; contesto storico-culturale.\n- Autori, opere e correnti con date; tesi/antitesi e dibattiti interpretativi.\n- Citazioni chiave e distinzione fonti primarie/secondarie.\n- Analisi comparata tra autori/movimenti e continuità/rotture.`;
  }
}

/**
 * The three mnemonic techniques taught in executive/managerial memory training,
 * baked into EVERY generated artifact (cards, notes, guides, exams).
 *
 *  1. Method of loci / memory palace (spatial-visual anchoring)
 *  2. Chunking (Miller 1956 — working memory holds ~7±2, realistically 3-5 units)
 *  3. Acronyms & acrostics (first-letter encoding for lists and sequences)
 */
export const MNEMONIC_TECHNIQUES = `MNEMOTECNICHE INTEGRATE (obbligatorie in ogni materiale prodotto):
1. METODO DEI LOCI (memory palace): per i concetti chiave fornisci un'immagine mentale vivida, concreta e spazialmente collocabile — bizzarra, esagerata o in movimento funziona meglio (es. Festinger che litiga con se stesso davanti a uno specchio d'ingresso = dissonanza cognitiva). Le immagini devono essere ancorabili a tappe di un percorso familiare.
2. CHUNKING (Miller 1956): organizza SEMPRE l'informazione in gruppi di 3-5 elementi. Mai elenchi piatti di 8+ voci: spezzali in sotto-gruppi semanticamente coerenti con un'etichetta per gruppo. La gerarchia è il chunking applicato.
3. ACRONIMI E ACROSTICI: quando c'è una lista o sequenza da memorizzare (fasi, criteri, componenti), costruisci un acronimo pronunciabile o un acrostico in italiano con le iniziali, e spiegane lo scioglimento (es. per le 5 fasi X-Y-Z → "acronimo: XYZ, dove X sta per...").
Applica la tecnica più adatta al contenuto; per il materiale denso combina tutte e tre. Le mnemotecniche AFFIANCANO il rigore accademico, non lo sostituiscono mai.`;

/** Compose the full system prompt for a module. */
export function buildSystem(
  moduleRole: string,
  level: StudyLevel,
  subject: StudySubject,
  hasSource: boolean,
): string {
  return [
    QUALITY_STANDARDS,
    "",
    subjectGuidance(subject),
    "",
    MNEMONIC_TECHNIQUES,
    "",
    moduleRole,
    "",
    levelGuidance(level),
    "",
    groundingDirective(hasSource),
  ].join("\n");
}

/* ─── Bloom taxonomy ──────────────────────────────────────────────────────── */

export type BloomLevel = "ricordare" | "comprendere" | "applicare" | "analizzare";

export const BLOOM_LEVELS: BloomLevel[] = [
  "ricordare",
  "comprendere",
  "applicare",
  "analizzare",
];

/** Flashcard format mix, per the module spec (proportions are targets). */
export const CARD_FORMAT_MIX =
  "Mix di formati (proporzioni indicative): ~40% Q&A classiche, ~25% cloze deletion in formato Anki {{c1::...}}, ~20% applicative (vignetta breve → quale concetto/disturbo/bias è illustrato?), ~15% comparative (differenza tra X e Y). Almeno il 35% delle card deve stare sopra il livello 'ricordare'.";
