/**
 * dedications.ts — le canzoni dedicate, recuperate dal progetto-regalo
 * originale (compleanno/data/songs_*.json) e rese riproducibili: ogni brano è
 * risolto al suo URL ufficiale su Apple Music (via iTunes Search, nessuna
 * chiave necessaria), così il player a incorporo lo suona direttamente.
 *
 * "Love" alimenta le domeniche della bacheca (e ogni giorno finché non ci
 * sono playlist collegate); "support" risponde al pulsante delle giornate no.
 */

export interface Dedication {
  title: string;
  artist: string;
  year: number;
  /** the message written for her — the heart of the gift. */
  text: string;
  /** canonical music.apple.com track url (feeds the official embed player). */
  url: string;
}

export const LOVE_DEDICATIONS: Dedication[] = [
  {
    title: "Here Comes the Sun",
    artist: "The Beatles",
    year: 1969,
    text: "Ci sono momenti in cui arrivi e sento il freddo andarsene, come se portassi il sole con te. Questa canzone parla esattamente di quel tipo di luce.",
    url: "https://music.apple.com/it/album/here-comes-the-sun/1441164426?i=1441164589",
  },
  {
    title: "Let It Be",
    artist: "The Beatles",
    year: 1970,
    text: "Alcune cose non hanno bisogno di essere aggiustate. A volte basta tenerle con tenerezza, senza cercare di cambiarle. Questo l'ho imparato guardando come affronti le giornate difficili.",
    url: "https://music.apple.com/it/album/let-it-be-2021-mix/1582219768?i=1582223667",
  },
  {
    title: "Yesterday",
    artist: "The Beatles",
    year: 1965,
    text: "Ogni tanto guardo indietro e non riesco a credere che esistessero giorni prima di conoscerti. È strano come la vita si divida così chiaramente in un prima e un dopo.",
    url: "https://music.apple.com/it/album/yesterday/1441164524?i=1441164805",
  },
  {
    title: "Imagine",
    artist: "John Lennon",
    year: 1971,
    text: "Ci sono persone che ti fanno credere che un mondo migliore sia possibile — non con le parole, ma con il modo in cui trattano chi hanno vicino. Tu sei una di quelle persone.",
    url: "https://music.apple.com/it/album/imagine/1436922341?i=1436922357",
  },
  {
    title: "What a Wonderful World",
    artist: "Louis Armstrong",
    year: 1967,
    text: "Passeggiare con te cambia il modo in cui guardo le cose. Quello che normalmente scorro senza vedere — un albero, il cielo, il colore di una facciata — diventa qualcosa di cui vale la pena fermarsi.",
    url: "https://music.apple.com/it/album/what-a-wonderful-world/1440787250?i=1440787254",
  },
];

export const SUPPORT_DEDICATIONS: Dedication[] = [
  {
    title: "Fix You",
    artist: "Coldplay",
    year: 2005,
    text: "Nei giorni in cui ti senti a pezzi, ricorda che non devi aggiustarti da sola. Ci sono persone che vogliono stare accanto ai frammenti con te, senza fretta e senza giudizio.",
    url: "https://music.apple.com/it/album/fix-you/1123076757?i=1123076826",
  },
  {
    title: "The Scientist",
    artist: "Coldplay",
    year: 2002,
    text: "A volte torniamo indietro con la testa cercando di capire dove le cose sono andate in un certo modo. Ma il posto migliore da cui guardare è sempre questo: adesso, qui.",
    url: "https://music.apple.com/it/album/the-scientist/695500500?i=695500502",
  },
  {
    title: "Beautiful Day",
    artist: "U2",
    year: 2000,
    text: "Anche nei giorni in cui tutto sembra difficile, c'è sempre un momento — piccolo, quasi nascosto — in cui qualcosa è bello. Vale la pena cercarlo.",
    url: "https://music.apple.com/it/album/beautiful-day/1445667357?i=1445667982",
  },
];

/**
 * Sundays belong to the dedications: on those days the daily song is one of
 * his, with the message shown under the player. Noon anchor avoids TZ edges.
 */
export function isDedicationDay(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00`).getDay() === 0;
}
