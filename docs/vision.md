# Memora — Visione: l'economia della competenza

> Documento di riferimento del progetto. Non è codice, è la bussola contro cui
> decidere ogni feature. Va corretto pezzo per pezzo man mano che l'idea si
> affina. Stato: **bozza / checkpoint** — 2026-07-07.

---

## 1. In una frase

Memora smette di essere solo un'app di studio privata e diventa **un'economia
della competenza verificabile**: fai lavoro reale (studio, progetti, obiettivi),
una verifica difficile da falsificare lo trasforma in **reputazione** (uno score
che *non si compra*) e in **valuta** (che si spende in un libero mercato tra
persone). La reputazione, essendo credibile, diventa un segnale utile anche fuori
dall'università: **scouting per aziende e formazione di gruppi di lavoro**.

## 2. Da dove partiamo (cosa è Memora oggi)

Memora è già un'app di studio **local-first**: nessun backend, nessun account,
nessuna telemetria. I dati vivono in `localStorage` e viaggiano tra i membri di
un gruppo dentro i link d'invito, con `mergeGroups()` che unisce per id
(`src/workgroup.ts`). Abbiamo già gli ingredienti chiave:

- un **event log di review** (`ReviewEvent[]` in `src/types.ts`);
- **statistiche pure e testate** (`src/stats.ts`): streak, retention, carte
  mature, previsione voto;
- **flashcard SM-2** (`src/sm2.ts`) e un **AI engine** che genera deck, note,
  mappe concettuali, mock exam, e **valuta il free-recall** (`src/engine.ts`,
  `src/claude.ts`);
- **workgroup** con sync via link (`src/workgroup.ts`).

Lo score social **non va inventato da zero**: è una funzione di dati che già
produciamo.

## 3. Il volano (three-sided economy)

```
Impegno ──▶ Verifica ──┬──▶ Reputazione ──▶ Scouting (aziende · team)
(studio,   (difficile   │    (score, NON spendibile)
progetti,   da fingere) │
obiettivi)              └──▶ Valuta ──▶ Mercato libero (deck · note · tutoraggio)
    ▲                        (spendibile)              │
    └──────────── compri aiuto → studi ancora ─────────┘

           ✕  FIREWALL: la valuta NON compra reputazione
```

Tre lati: **chi studia**, **chi insegna/produce** (spesso la stessa persona), e
le **organizzazioni** che scoutano talento o formano squadre.

## 4. Reputazione (lo "score") — l'anima

Lo score **non è un numero solo** (un numero unico crea gerarchie tossiche alla
Instagram). Sono **assi separati**, così nessuno "vince" in assoluto e ognuno
eccelle dove può. Anime confermate con l'utente:

- **Padronanza** — carte mature + retention a lungo termine (`stats.ts`). Premia
  il *ricordare*, non il cliccare. È il **segnale sempre-attivo**: si dimostra da
  sola dentro Memora, senza bisogno di alcun ateneo (vedi §11).
- **Traguardi** — obiettivi portati a termine, **generalizzati oltre gli esami**:
  esami, certificazioni, corsi, milestone di progetto (per il lato aziende).
  Portano sempre con sé la loro **provenienza/livello di verifica** (vedi §10).
- **Progresso, non livello assoluto** — premia chi *migliora* su una materia
  debole o *recupera* dopo aver mollato, non solo i primi della classe. Rende il
  social inclusivo invece di una vetrina dei soliti bravi.
- **Obiettivi di gruppo** — meta comune e score *collettivo*: si vince insieme.

Candidata forte tenuta in riserva:

- **Insegnare/aiutare** — salire di livello *spiegando* e producendo materiale
  utile ad altri. L'anti-Instagram: emergi *dando*, non *performando*. Si lega
  naturalmente al mercato (§5).

## 5. Valuta e libero mercato (modello "SMP")

La valuta **circola tra le persone**, non si spende su un catalogo fisso. I
prezzi fluttuano su domanda/offerta. La guadagni **studiando e producendo**.

Cosa si scambia: **asset di studio** (deck, riassunti, mappe, mock exam — Memora
li genera già), **tutoraggio** (mercato del tempo), **bounty/commissioni** (posti
un ordine, la domanda guida la creazione), **staking su di sé** (⚠️ retrogusto
azzardo), **tesoreria di gruppo** verso una meta condivisa.

### 5.1 L'AI non deve far collassare il mercato

Rischio identificato: se l'AI genera *gratis* i beni che il mercato scambia,
l'offerta è infinita → la scarsità muore → il mercato collassa. Due mosse lo
tengono in piedi:

- **Mossa A — l'AI è un *sink* di valuta, non un rubinetto gratis.** Generare con
  l'AI **costa valuta**, e più alto è il livello (§5.2) più costa — coerente col
  fatto che il tier alto usa il modello più forte = più token = più costo reale.
  L'AI *consuma* valuta invece di inondare beni gratis. (È la vecchia idea dei
  "crediti AI di studio": studi → guadagni → spendi per generare.)
- **Mossa B — gli umani scambiano ciò che l'AI non sa creare.** L'AI inonda il
  materiale *grezzo*; resta scarso: il materiale **provato** (track record di
  risultati, non "un deck" qualsiasi), il **tempo umano** (tutoraggio, feedback,
  dubbi specifici), le **commissioni su misura**, la **reputazione**. Il bene
  scambiato non è l'artefatto crudo ma la *fiducia* attorno ad esso.

### 5.2 Generazione AI a livelli, con reward

I livelli **esistono già** nel motore (`src/engine.ts`: `StudyLevel =
"triennale" | "magistrale" | "concorso"`, con `levelGuidance()`; e una
`difficulty` per domanda d'esame + tag Bloom sulle card). Il lavoro nuovo è
*agganciare un reward*, non inventare i livelli.

- Fermarsi a **3 stadi** (rinominare `concorso` → **Professionale/Lavoro** per il
  lato aziende). Più livelli = gradazioni di reward troppo sottili.
- Secondo asse, **la difficoltà per singolo item** (Bloom + facile/medio/difficile):
  è ciò che pesa davvero sui punti.
- **Tier alti = modello più forte + source grounding + rubriche da esame vero.**
  La qualità in cima costa più token → più valuta → rinforza il sink (§5.1).

**Regola anti-gaming (§11):** il reward non lo dà *selezionare* un livello — è
gratis — ma *dimostrarlo*. Il livello alza il *tetto* di difficoltà; i punti si
bancano solo su free-recall corretto e **ritardato** di item davvero difficili.
Per i mock test: premia la performance sotto calibrazione difficile, **non** il
numero di tentativi (un esame si rifà all'infinito → conta primo tentativo /
versioni nuove, mai il grinding dello stesso esame).

## 6. La regola d'oro (firewall)

**La valuta compra aiuto, strumenti ed estetica — MAI reputazione.** Lo score si
guadagna *solo* con lavoro verificato. Nel codice: `Reputation` e `Wallet` sono
strutture separate e **nessuna funzione può convertire l'una nell'altra**.

## 7. Visibilità: pubblico vs privato (scelta dell'utente)

- **Privato** (default) — stat solo tue, come oggi.
- **Gruppo** — condividi gli assi coi membri del gruppo (sync workgroup esistente).
- **Profilo pubblico** — una "study card" condivisibile (badge, streak, ore,
  traguardi), ma *tu scegli cosa*. È anche la superficie dello scouting.

## 8. Il lato aziende / scouting

Il valore raro di un'app che traccia lo studio è che produce **prova di
competenza difficile da falsificare** — ciò che cercano recruiter e team lead.
Lo studente costruisce un profilo di padronanza *dimostrata*; l'azienda scouta sul
reale. Gli stessi meccanismi di gruppo servono ad aziende per onboarding e
upskilling. Conseguenza: lo scouting **alza la posta dell'anti-cheat**.

## 9. Identità e login

Modello a **livelli di identità** — la verifica universitaria è un *badge di
fiducia*, non un muro all'ingresso (altrimenti tagli fuori aziende e team di
lavoro previsti dalla visione):

- **Account base** (email qualsiasi) — usi Memora e il mercato.
- **🎓 Studente verificato** (email universitaria) — badge, sblocca le classifiche
  per ateneo/corso, pesa di più nello scouting.
- **💼 Professionista verificato** (email aziendale, più avanti) — lato aziende.

Meccanismo, in due modi:

- **B) Verifica dell'email universitaria** *(scelto per la v1)* — mandi un
  codice/link a `nome.cognome@studenti.ateneo.it`, lo confermano. Dal **dominio**
  sai quale ateneo. **Nessun accordo istituzionale**, scala da solo. È la forma
  concreta del backend di Fase 1.
- **A) SSO d'ateneo (SAML/Shibboleth via federazione IDEM GARR / eduGAIN)** —
  gold standard, ma richiede di registrarsi come Service Provider e un accordo
  **ateneo per ateneo**. Da fase partner, non da subito.

Nota: **la matricola non è un autenticatore** (è stampata sui badge, spesso
sequenziale). È un dato di profilo, dichiarato o ricavato dall'email; ad
autenticare è l'account universitario.

**Privacy/GDPR** (studenti a volte minorenni): memorizza il **minimo** — flag
"verificato", dominio/ateneo, al massimo la matricola — *non* l'intera carriera.

## 10. Verificare i traguardi: la scala della fiducia

Non puoi *sapere* che un voto è reale se non te lo dice la fonte di verità
(l'ateneo). Quindi il design **non finge**: ogni traguardo porta la sua
provenienza, e peso/visibilità scalano con essa. Mai mostrare "dichiarato" come
"verificato".

| Livello | Come | Vale | Limite |
|---|---|---|---|
| **0 · Auto-dichiarato** | l'utente lo scrive | motivazione personale, zero peso pubblico | non verificato — va marchiato "dichiarato" |
| **1 · Peer-confermato** | i membri del gruppo confermano | obiettivi di gruppo a bassa posta | collusione tra amici — regge solo con identità verificate |
| **2 · Prova documentale** | screenshot/PDF del libretto | — | falsificabile: **da evitare** come "verificato" (falsa sicurezza) |
| **3 · SSO/API d'ateneo** | leggi la carriera dalla fonte (in Italia di solito ESSE3/Cineca) | autorevole | richiede partnership |
| **4 · Credenziale digitale firmata** | l'ateneo firma il titolo (Europass EDC / Open Badges 3.0 / W3C VC, EBSI) | autorevole e verificabile offline | richiede che l'ateneo emetta credenziali |

**Da NON fare:** maneggiare le credenziali dell'ateneo per "leggere il libretto
al posto suo" (disastro di sicurezza + viola i ToS). La lettura ufficiale passa
solo da livello 3 o 4.

## 11. Anti-cheat: rendere il barare inutile (proof of study)

Principio, dalle parole dell'utente: *"nessuno copierebbe, perderebbe solo
tempo"*. Vero **a una condizione**: che non esista scorciatoia per ottenere il
numero senza fare il lavoro. Le due metriche ingenue tradiscono — **"ore app
aperta"** (timer lasciato andare) e **"click su corretto"** (autoclicker/carte
girate a caso) si falsificano senza imparare nulla. Il lavoro di design è uno:
**la via più economica per un punteggio alto dev'essere studiare davvero.**

Come si rende onesta la metrica:

1. Conta il **richiamo attivo** (review risposte), non i minuti a monitor.
2. Preferisci il **free-recall giudicato dall'AI** al semplice flip: costoso da
   automatizzare, ed è **già presente** in Memora.
3. Pesa la correttezza sulle review **ritardate/mature**: il tempo filtra i bot.
4. **Pesa per difficoltà:** una carta dura e matura vale più di dieci nuove e
   banali → niente farming di roba facile.
5. **Limiti di ritmo/anomalie:** rendimento decrescente oltre una cadenza umana.
6. La metrica **esce dall'event log**, non è auto-dichiarata dall'utente.

Formula-sketch del reward (da rifinire, §16):
`punti(review) = base × pesoDifficoltà(livello, bloom, item) × corretto ×
fattoreMaturità(ritardo)`, con rendimento decrescente oltre una cadenza umana.
Il `pesoDifficoltà` viene dai tag Bloom e dalla `difficulty` che il motore già
produce. Il **livello scelto non dà punti**; li dà solo l'esito verificato su
item di quel livello (§5.2).

**Correzione importante:** premia il *risultato*, non le *ore*. Contare le ore
premia lo studio lento e inefficiente. Le **ore restano un dato di contesto** sul
profilo ("nero su bianco quanto ho studiato"), ma **score e valuta** si guadagnano
sul **richiamo corretto e sulla padronanza**, non sul tempo grezzo.

Questa prova comportamentale è il **livello sempre-attivo**: funziona senza alcun
ateneo, da subito, ed è "abbastanza buona" per motivazione personale, classifiche
di gruppo e profilo pubblico soft. Non prova che hai passato l'esame — quello
resta il livello **verificato bonus** (§10) che si aggiunge coi partner.

## 12. Tensioni note e decisioni prese

1. **Anti-cheat è il problema #1** (§11). Con classifiche globali + scouting,
   qualcuno automatizzerà lo studio finto. Difesa: metriche costose nel tempo
   (retention a lunga finestra, free-recall, peso per difficoltà) + identità
   verificata anti-Sybil.
2. **Valuta chiusa, niente prelievo in denaro** (finché il modello non è provato).
   Euro veri = essay-mill, tasse, normativa azzardo, minorenni. Guadagnare valuta
   solo studiando neutralizza il "pay-to-win" alla radice.
3. **Integrità accademica**: confine tutoraggio vs "vendo le risposte" da
   disegnare da subito, o lo scouting perde credibilità.
4. **Provenienza sempre trasparente**: "dichiarato" ≠ "verificato", badge e peso
   diversi (§10).
5. **L'AI è un sink di valuta, non un faucet** (§5.1): generare costa valuta,
   così l'offerta infinita di materiale non azzera il mercato.
6. **Reward per merito dimostrato, non per livello scelto** (§5.2, §11).
7. **Non over-monetizzare l'atto di studiare** (rischio *overjustification*: pagare
   un'attività intrinseca ne spegne l'interesse). La valuta muove il **mercato**
   (produrre/insegnare/scambiare); l'**apprendimento** resta mosso da padronanza,
   progresso e gruppo — stesso spirito del firewall.

## 13. Architettura a fasi

L'utente ha scelto le **classifiche globali** → un backend per il livello social
è necessario, ma non tutto subito.

- **Fase 0 — logica pura, zero backend.** `src/score.ts` (assi di reputazione dal
  deck + event log, stile `stats.ts`) e `src/wallet.ts` (valuta, separato per
  costruzione = firewall). Mostrato dentro i workgroup con la sync esistente.
- **Fase 1 — backend social minimo.** Auth con **verifica email universitaria**
  (§9), classifiche di gruppo, profili e **leghe stagionali tra gruppi** (§14).
  Si innesta sul merge layer di `workgroup.ts`.
- **Fase 2 — mercato.** Wallet condiviso, listini, bounty, transazioni.
- **Fase 3 — scouting + verifica forte.** Profili pubblici per organizzazioni;
  traguardi di livello 3–4 con atenei partner.

Ogni fase è utile da sola.

## 14. Competizione tra gruppi (come nascono le community)

La competizione tra gruppi è probabilmente il **motore che crea le community**,
non un accessorio. Vive nella Fase 1 (richiede la verità condivisa del backend).

**Problema #1 — i gruppi piccoli devono poter vincere.** Sommare i punti dei
membri fa vincere sempre il gruppo più grande → i piccoli/nuovi si arrendono →
nessuna community nuova nasce. Antidoti, insieme:

- **Punteggio pro-capite**, non totale (5 affiatati battono 50 svogliati).
- **Leghe/divisioni** per cohort simili + **promozione/retrocessione** (stile
  Duolingo): competi contro chi è alla tua portata.
- **Basato sul *miglioramento***, non sul livello assoluto (riaggancia "progresso
  non livello", §4).

**Le stagioni tengono viva la speranza.** Una classifica permanente dove vince
sempre lo stesso gruppo è demotivante; il reset stagionale azzera le gerarchie e
fa tornare la gente. Le dinastie uccidono i social competitivi.

**Ossatura:** (1) **leghe stagionali** come spina dorsale sempre-attiva; (2)
**sfide testa-a-testa** tra gruppi sopra, per rivalità e narrazione. La
competizione si misura sugli **aggregati verificati** del proof-of-study (§11),
mai su numeri falsificabili.

**Come crea community diverse** — dagli assi di appartenenza legati all'identità
(§9): **per ateneo** (UniBo vs PoliMi, sfrutta lo studente verificato), **per
corso/materia** (tutti i gruppi di "Analisi 1"), per coorte/regione/interesse.

**Premi (firewall §6):** vincere dà **gloria di gruppo** (badge, titoli,
prestigio) e alimenta la **tesoreria di gruppo** (valuta collettiva), **mai
reputazione individuale non guadagnata**.

**Guardie:**
- *Anti-gaming:* mercenari che saltano gruppo e free-rider → contributo che
  richiede permanenza, soglia minima di membri attivi, identità anti-Sybil.
- *Benessere* (studenti, a volte minorenni): competizione **opt-in**, niente
  gogna per chi perde, celebra il *miglioramento*, esperienza di default **non**
  competitiva. La competizione è un livello a cui ti unisci, non una gabbia.

## 15. Il Diario di Bordo del gruppo

Un racconto condiviso e **privato al gruppo** che si scrive da solo dai log dei
membri, ma registra **solo i momenti che contano** — traguardi e cadute clamorose
— non i click quotidiani. È il lato **narrativo** che completa quello numerico
(score/classifiche): le stat dicono *chi è avanti*, il diario dice *la storia*. È
il motore emotivo che rende un gruppo una *community*, e la realizzazione del
"premia il percorso".

**Il filtro editoriale decide tutto** (come l'anti-cheat). Cosa entra:

- *Successi:* primo esame passato, traguardo di streak, carta matura e difficile
  domata, salto di retention, obiettivo di gruppo raggiunto, **il ritorno**
  (streak recuperata), nuovo livello, record personale.
- *Cadute clamorose:* lunga streak spezzata, mock crollato dopo preparazione, un
  topic-nemesi — raccontate con **compassione**, come parte dell'arco, mai gogna.
- *Escluso (rumore):* "ripassate 12 carte", "app aperta", "deck generato".

**Generazione ibrida:** le **regole rilevano** l'evento (deterministico, privato,
i dati non escono); l'**AI lo narra** (opzionale, opt-in — manda dati al provider,
quindi non di default). L'AI è solo una *pelle* sopra eventi che esistono già.

**Guardia etica** (minorenni): i **successi si auto-pubblicano, le cadute le
controlla il membro** (o compaiono solo retroattivamente, una volta redente). Il
diario non deve mai umiliare.

**Ruolo strutturale:** resta **senza punteggio e senza valuta** — l'unico strato
puramente di significato/appartenenza, contrappeso intrinseco allo scoring
(anti-*overjustification*, §12.7). Al massimo **kudos** in reazione (valuta-
gentilezza, §5).

**Tecnicamente:** il rilevamento dei "momenti degni di nota" è **logica pura**
sull'event log — stessa natura di `score.ts`, quindi **fattibile in Fase 0**;
l'aggregazione di gruppo passa dalla sync `mergeGroups` esistente. Può funzionare
*prima* del backend completo.

## 16. Domande aperte

- Pesi relativi degli assi di reputazione, senza farli ricollassare in un unico
  numero-classifica mascherato.
- "Insegnare/aiutare" entra nella reputazione o resta *solo* fonte di valuta?
- Confine preciso tutoraggio vs cheating.
- Formula concreta del "proof of study" (§11): soglie di ritmo, peso difficoltà,
  come combinare free-recall e review normali.
- **Prezzo in valuta della generazione AI per livello** (§5.1–5.2): quanto costa
  generare a Triennale vs Professionale, per bilanciare il sink senza bloccare i
  nuovi utenti (che hanno poca valuta).
- Rinominare `concorso` → **Professionale/Lavoro** e ricalibrare `levelGuidance()`.
- Moderazione del mercato e dei profili pubblici.
