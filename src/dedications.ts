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
    text: "Certe persone portano il sole senza accorgersene. Tu, per esempio.",
    url: "https://music.apple.com/it/album/here-comes-the-sun/1441164426?i=1441164589",
  },
  {
    title: "Let It Be",
    artist: "The Beatles",
    year: 1970,
    text: "Non tutto va aggiustato: certe cose basta tenerle con cura. Me l'hai insegnato tu.",
    url: "https://music.apple.com/it/album/let-it-be-2021-mix/1582219768?i=1582223667",
  },
  {
    title: "Yesterday",
    artist: "The Beatles",
    year: 1965,
    text: "C'è un prima e un dopo averti conosciuta. Il dopo mi piace di più.",
    url: "https://music.apple.com/it/album/yesterday/1441164524?i=1441164805",
  },
  {
    title: "Imagine",
    artist: "John Lennon",
    year: 1971,
    text: "Un mondo migliore sembra più credibile da quando ci sei tu.",
    url: "https://music.apple.com/it/album/imagine/1436922341?i=1436922357",
  },
  {
    title: "What a Wonderful World",
    artist: "Louis Armstrong",
    year: 1967,
    text: "Con te anche una strada qualunque diventa un posto da guardare meglio.",
    url: "https://music.apple.com/it/album/what-a-wonderful-world/1440787250?i=1440787254",
  },
];

export const SUPPORT_DEDICATIONS: Dedication[] = [
  {
    title: "Fix You",
    artist: "Coldplay",
    year: 2005,
    text: "Non devi aggiustarti da sola: io ci sono, anche per i pezzi.",
    url: "https://music.apple.com/it/album/fix-you/1123076757?i=1123076826",
  },
  {
    title: "The Scientist",
    artist: "Coldplay",
    year: 2002,
    text: "Smetti di riavvolgere il nastro. Il posto migliore da cui guardare è qui, adesso.",
    url: "https://music.apple.com/it/album/the-scientist/695500500?i=695500502",
  },
  {
    title: "Beautiful Day",
    artist: "U2",
    year: 2000,
    text: "Anche nelle giornate storte c'è un momento buono. Di solito è piccolo: cercalo.",
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
