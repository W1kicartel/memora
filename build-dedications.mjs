/**
 * build-dedications.mjs — resolve a hand-written catalogue of songs + love
 * notes into real Apple Music track URLs (via the free iTunes Search API,
 * no key) and emit src/dedications.ts. Every entry becomes a "song of the
 * day" with its dedication; 300 of them = a song, and a note, every single
 * day for ~10 months before anything repeats.
 *
 *   node build-dedications.mjs        → writes src/dedications.ts
 *   node build-dedications.mjs --dry  → resolve only, report misses
 */
import { writeFileSync } from "fs";

// [title, artist, dedication]. Kept abundant (>300) so we still land 300 even
// when a few titles don't resolve cleanly.
const SONGS = [
  ["Here Comes the Sun", "The Beatles", "Certe persone portano il sole senza accorgersene. Tu, per esempio."],
  ["Something", "The Beatles", "Non so spiegare cosa mi fai. So solo che è la cosa più bella che mi capita."],
  ["In My Life", "The Beatles", "Di tutti i posti e le persone della mia vita, tu sei quella che amo di più."],
  ["Let It Be", "The Beatles", "Non tutto va aggiustato: certe cose basta tenerle con cura. Me l'hai insegnato tu."],
  ["Yesterday", "The Beatles", "C'è un prima e un dopo averti conosciuta. Il dopo mi piace di più."],
  ["I Will", "The Beatles", "Ti ho amata prima di conoscerti, e ti amerò anche dopo. Nel mezzo, sono fortunato."],
  ["And I Love Her", "The Beatles", "Dammi un motivo qualsiasi: io ti amo comunque, e più di così non si può."],
  ["Imagine", "John Lennon", "Un mondo migliore sembra più credibile da quando ci sei tu."],
  ["Woman", "John Lennon", "Tutto quello che sono te lo devo un po'. Grazie di esserci."],
  ["Oh Yoko!", "John Lennon", "Nel mezzo di qualsiasi cosa, il tuo nome mi salva. Sempre."],
  ["What a Wonderful World", "Louis Armstrong", "Con te anche una strada qualunque diventa un posto da guardare meglio."],
  ["La Vie en Rose", "Louis Armstrong", "Quando ci sei tu, vedo tutto un po' più rosa. Ed è bellissimo."],
  ["My Girl", "The Temptations", "Ho la mia primavera anche a gennaio: sei tu."],
  ["Ain't No Mountain High Enough", "Marvin Gaye", "Non c'è distanza abbastanza grande da tenermi lontano da te."],
  ["Let's Stay Together", "Al Green", "Nei giorni belli e in quelli storti: io resto. È una promessa."],
  ["Stand by Me", "Ben E. King", "Finché ci sei tu accanto, non ho paura di niente."],
  ["Unchained Melody", "The Righteous Brothers", "Il tempo passa lento quando non ci sei. Torna, che ti aspetto."],
  ["At Last", "Etta James", "Finalmente. Ti ho cercata in tante canzoni e sei sempre stata tu."],
  ["I Only Have Eyes for You", "The Flamingos", "In una stanza piena di gente, vedo solo te. Sempre."],
  ["Can't Help Falling in Love", "Elvis Presley", "Certe cose sono inevitabili. Innamorarmi di te è stata la più dolce."],
  ["Love Me Tender", "Elvis Presley", "Trattami piano e io sarò tuo per sempre. Lo sono già."],
  ["Your Song", "Elton John", "Non ho gran che da offrire, solo questa: una vita a dirti quanto sei speciale."],
  ["Tiny Dancer", "Elton John", "Balla pure la tua vita: io ti tengo la mano tutto il tempo."],
  ["Wonderful Tonight", "Eric Clapton", "Non te ne accorgi neanche di quanto sei bella. Io sì, ogni sera."],
  ["Something in the Way She Moves", "James Taylor", "Basta un tuo gesto qualunque e mi si sistema la giornata."],
  ["How Sweet It Is (To Be Loved by You)", "James Taylor", "Non sapevo cosa mi mancasse finché non sei arrivata tu."],
  ["The Book of Love", "Peter Gabriel", "Il libro dell'amore è lungo e noioso, dicono. Con te non ne ho saltato una pagina."],
  ["In Your Eyes", "Peter Gabriel", "Negli occhi tuoi trovo la luce quando fuori è buio."],
  ["Just the Way You Are", "Billy Joel", "Non cambiare niente per me: ti amo esattamente come sei."],
  ["She's Always a Woman", "Billy Joel", "Con tutte le tue contraddizioni, resti la cosa più vera che ho."],
  ["Songbird", "Fleetwood Mac", "A te dedico le parole che non riesco a dire: ti amo, come non ho mai amato prima."],
  ["Landslide", "Fleetwood Mac", "Gli anni passano, io cambio, ma la voglia di stare con te no."],
  ["Have I Told You Lately", "Rod Stewart", "Te l'ho detto oggi quanto ti amo? Nel caso: tantissimo."],
  ["Make You Feel My Love", "Adele", "Non c'è niente che non farei per farti sentire quanto ti amo."],
  ["Lovesong", "Adele", "Ovunque io sia, quando ci sei tu sono a casa."],
  ["To Make You Feel My Love", "Bob Dylan", "Da quando ti conosco so cosa vuol dire volere il bene di qualcuno più del proprio."],
  ["I Want to Hold Your Hand", "The Beatles", "Mi basta poco: la tua mano nella mia e il mondo può aspettare."],
  ["God Only Knows", "The Beach Boys", "Solo il cielo sa dove sarei senza di te. Meno bene, questo è certo."],
  ["Wouldn't It Be Nice", "The Beach Boys", "Immagino i nostri giorni insieme e mi viene da sorridere come uno scemo."],
  ["Then He Kissed Me", "The Crystals", "Ricordo ancora com'era il mondo un attimo prima di te. Grigio."],
  ["This Will Be (An Everlasting Love)", "Natalie Cole", "Questo, tra noi, non è un capriccio: è per sempre."],
  ["Never Tear Us Apart", "INXS", "Che venga qualunque cosa: niente ci separa."],
  ["Wicked Game", "Chris Isaak", "Non ho mai voluto innamorarmi così tanto. Con te non ho potuto farne a meno."],
  ["The Power of Love", "Frankie Goes to Hollywood", "Ti proteggo io, dai fantasmi e dalle giornate storte. Fidati."],
  ["Time After Time", "Cyndi Lauper", "Se ti perdi, guardati indietro: io ci sono. Ogni volta."],
  ["True Colors", "Cyndi Lauper", "Mostrami pure i tuoi colori veri: sono la cosa più bella che io conosca."],
  ["Endless Love", "Diana Ross", "Sei il mio primo pensiero e l'ultimo. In mezzo, sempre tu."],
  ["I Say a Little Prayer", "Aretha Franklin", "Prima ancora del caffè, la mattina, penso a te."],
  ["(You Make Me Feel Like) A Natural Woman", "Aretha Franklin", "Mi fai sentire semplicemente me stessa. È il regalo più grande."],
  ["Isn't She Lovely", "Stevie Wonder", "Ogni volta che ti guardo penso la stessa cosa: ma quanto sei bella."],
  ["I Just Called to Say I Love You", "Stevie Wonder", "Nessun motivo particolare. Volevo solo dirti che ti amo."],
  ["My Cherie Amour", "Stevie Wonder", "Amore mio, ti guardo da lontano e mi si riempie il petto."],
  ["Signed, Sealed, Delivered I'm Yours", "Stevie Wonder", "Firmato, sigillato, consegnato: sono tuo. Da sempre."],
  ["Lately", "Stevie Wonder", "Ultimamente penso a te più del solito. Cioè: sempre di più."],
  ["Crazy", "Patsy Cline", "Sono pazzo di te, e non ho nessuna voglia di guarire."],
  ["Dream a Little Dream of Me", "The Mamas & the Papas", "Stanotte sogna un po' di me: io lo faccio ogni notte con te."],
  ["Everybody Loves Somebody", "Dean Martin", "Tutti amano qualcuno, prima o poi. Io ho avuto la fortuna di amare te."],
  ["The Way You Look Tonight", "Frank Sinatra", "Un giorno, quando sarò vecchio, ricorderò te esattamente così."],
  ["I've Got You Under My Skin", "Frank Sinatra", "Ti porto sottopelle: non c'è verso di toglierti, e non lo voglio."],
  ["Fly Me to the Moon", "Frank Sinatra", "Portami dove vuoi tu: basta tenerti la mano."],
  ["L-O-V-E", "Nat King Cole", "Quattro lettere per dire una cosa enorme: quello che provo per te."],
  ["Unforgettable", "Nat King Cole", "Indimenticabile, ecco cosa sei. In tutti i sensi."],
  ["Feeling Good", "Nina Simone", "È una nuova alba, un nuovo giorno, una nuova vita. E la voglio con te."],
  ["My Baby Just Cares for Me", "Nina Simone", "Di tutto il mondo, la cosa che preferisco è che tu tenga a me."],
  ["Cheek to Cheek", "Ella Fitzgerald", "Guancia a guancia con te sto in paradiso. Nemmeno mi accorgo del resto."],
  ["Dream", "Ella Fitzgerald", "Quando le cose vanno storte, chiudo gli occhi e sogno te."],
  ["Come Away with Me", "Norah Jones", "Portami via con te, dove vuoi. Il posto non conta se ci sei."],
  ["The Nearness of You", "Norah Jones", "Non è la luna, non è la musica: è la tua semplice vicinanza a incantarmi."],
  ["Lucky", "Jason Mraz", "Sono fortunato ad amare la mia migliore amica. Sei tu."],
  ["I'm Yours", "Jason Mraz", "Non c'è molto altro da dire: sono tuo. Fanne quel che vuoi."],
  ["Better Together", "Jack Johnson", "Tutto ha più senso quando lo facciamo insieme. Tutto."],
  ["Banana Pancakes", "Jack Johnson", "Fingiamo che fuori piova e restiamo a letto: solo io e te."],
  ["Ho Hey", "The Lumineers", "Ti appartengo, tu appartieni a me: è la cosa più semplice che io sappia."],
  ["Death and All His Friends", "Coldplay", "Alla fine di tutto, se ci sei tu, va bene qualunque cosa."],
  ["Yellow", "Coldplay", "Guarderei le stelle tutta la notte, e sarebbero comunque meno luminose di te."],
  ["Fix You", "Coldplay", "Non devi aggiustarti da sola: io ci sono, anche per i pezzi."],
  ["The Scientist", "Coldplay", "Smetti di riavvolgere il nastro. Il posto migliore da cui guardare è qui, adesso."],
  ["Sparks", "Coldplay", "Ti proteggo io. Anche quando non te ne accorgi, ci sono."],
  ["Magic", "Coldplay", "Credo ancora nella magia, sì. La prova sei tu."],
  ["Beautiful Day", "U2", "Anche nelle giornate storte c'è un momento buono. Di solito è piccolo: cercalo."],
  ["With or Without You", "U2", "Con te o senza te non so stare. Per fortuna ho scelto: con te."],
  ["All I Want Is You", "U2", "Puoi tenerti tutto il resto del mondo. A me basti tu."],
  ["Sweetest Thing", "U2", "Sei la cosa più dolce che mi sia capitata. Senza nemmeno provarci."],
  ["Chasing Cars", "Snow Patrol", "Restiamo qui a non fare niente, io e te. Non mi serve altro."],
  ["Say You Love Me", "Jessie Ware", "Dimmelo quando ne hai voglia: che mi ami. Io lo penso di continuo."],
  ["Lost Without You", "Freya Ridings", "Senza di te mi perdo. Con te trovo perfino le cose che non cercavo."],
  ["Skinny Love", "Bon Iver", "Amiamoci per bene, senza risparmiarci. Ne vale la pena."],
  ["Holocene", "Bon Iver", "In mezzo a tutto l'immenso, mi sento piccolo e felice: perché ci sei tu."],
  ["The Only Exception", "Paramore", "Non credevo più all'amore. Poi sei arrivata tu, l'unica eccezione."],
  ["Lover", "Taylor Swift", "Possiamo lasciare le luci di Natale accese fino a gennaio: questa è casa, con te."],
  ["Love Story", "Taylor Swift", "Non importa quanto sia complicata la storia: io scelgo sempre te."],
  ["Enchanted", "Taylor Swift", "La cosa più bella di tutta la serata sei stata tu. Lo sei ancora."],
  ["You Are the Best Thing", "Ray LaMontagne", "Di tutte le cose belle che mi sono successe, tu sei la migliore."],
  ["Hold You in My Arms", "Ray LaMontagne", "Vieni qui: certi problemi si sciolgono solo tra le braccia giuste."],
  ["First Day of My Life", "Bright Eyes", "Giuro che la mia vita è cominciata il giorno che ti ho incontrata."],
  ["Such Great Heights", "The Postal Service", "Da quassù è tutto perfetto. Deve essere l'effetto che mi fai."],
  ["Ho un attimo di eternità", "Franco Battiato", "Con te ogni istante diventa un pezzetto di eternità."],
  ["La Cura", "Franco Battiato", "Ti proteggerò dalle paure delle ipocondrie. Ti porterò soprattutto il silenzio e la pazienza."],
  ["Stella del mattino", "Franco Battiato", "Sei la mia stella del mattino: la prima cosa buona di ogni giorno."],
  ["Caruso", "Lucio Dalla", "Ti voglio bene assai. Ma tanto tanto bene, sai."],
  ["Attenti al lupo", "Lucio Dalla", "Una casetta piccola, e dentro tu. Non chiedo altro alla vita."],
  ["Emozioni", "Lucio Battisti", "Con te ho capito cosa vuol dire seguire un aquilone dentro l'azzurro."],
  ["I Giardini di Marzo", "Lucio Battisti", "Il mondo intorno può correre: io mi fermo dove ci sei tu."],
  ["La canzone del sole", "Lucio Battisti", "Le bionde trecce, gli occhi azzurri e poi... la cosa più bella resti tu."],
  ["E penso a te", "Lucio Battisti", "Faccio mille cose e non ne ricordo una: perché intanto penso a te."],
  ["Il mio canto libero", "Lucio Battisti", "In un mondo che non ci vuole più, il nostro amore resta libero."],
  ["Con te partirò", "Andrea Bocelli", "Con te partirò per paesi che non ho mai visto. Basta andarci insieme."],
  ["Vivo per lei", "Andrea Bocelli", "Vivo per te, e non me ne vergogno per niente."],
  ["Meraviglioso", "Domenico Modugno", "Guarda che meraviglia la vita, e quanto di più da quando ci sei tu."],
  ["Nel blu dipinto di blu", "Domenico Modugno", "Con te volo, e volare così non fa nemmeno paura."],
  ["La donna cannone", "Francesco De Gregori", "Ti porterò via con me, oltre il tendone azzurro, fino al cielo."],
  ["Rimmel", "Francesco De Gregori", "Certe cose non si dimenticano. Il tuo sguardo, per esempio."],
  ["Buonanotte fiorellino", "Francesco De Gregori", "Buonanotte, fiorellino: chiudi gli occhi che ci penso io."],
  ["Quattro amici", "Gino Paoli", "In fondo alla lista delle cose importanti, ci sei sempre tu, prima di tutto."],
  ["Il cielo in una stanza", "Gino Paoli", "Quando sei qui con me, questa stanza non ha più pareti: ha il cielo."],
  ["Sapore di sale", "Gino Paoli", "Sapore di te sulla pelle: è la mia estate preferita."],
  ["Senza fine", "Gino Paoli", "Senza fine, tu trascini la mia vita. E io ti seguo volentieri."],
  ["Che sarà", "José Feliciano", "Non so cosa sarà di noi domani. So che voglio scoprirlo con te."],
  ["La prima cosa bella", "Nicola Di Bari", "La prima cosa bella che ho avuto dalla vita è il tuo sorriso."],
  ["Anima mia", "Cugini di Campagna", "Anima mia, torna a casa: qui c'è qualcuno che ti pensa sempre."],
  ["Ancora", "Eduardo De Crescenzo", "Ancora, e ancora, e ancora: ti sceglierei mille volte."],
  ["Almeno tu nell'universo", "Mia Martini", "In tutto l'universo che cambia, tu resti diversa da tutti. E sei mia."],
  ["Minuetto", "Mia Martini", "Anche quando fa male, con te ne vale la pena. Sempre."],
  ["La sera dei miracoli", "Lucio Dalla", "Con te ogni sera è la sera dei miracoli: basta guardarti."],
  ["Futura", "Lucio Dalla", "Qualunque cosa ci porti il futuro, lo voglio con te. Solo con te."],
  ["Se telefonando", "Mina", "Se potessi dirti tutto con una parola, direbbe solo il tuo nome."],
  ["Grande grande grande", "Mina", "Sei grande, grande, grande: nei difetti e in tutto il resto. E ti amo così."],
  ["E se domani", "Mina", "E se domani, e sottolineo se, dovessi perderti... non ci voglio nemmeno pensare."],
  ["Parole parole", "Mina", "A te non servono parole: mi basta lo sguardo per capirti."],
  ["Ancora ancora ancora", "Mina", "Ancora un giorno con te e poi un altro, e un altro ancora. Non mi stanco mai."],
  ["Vedrai vedrai", "Luigi Tenco", "Vedrai che un giorno andrà tutto bene. Intanto, ci sei tu, e basta."],
  ["Mi sono innamorato di te", "Luigi Tenco", "Mi sono innamorato di te perché non avevo niente da fare. E meno male."],
  ["Azzurro", "Adriano Celentano", "Cerco un po' d'Africa in giardino, ma mi basta il tuo profumo per partire lontano."],
  ["Il tempo se ne va", "Adriano Celentano", "Il tempo se ne va, ma certe cose no. Come quello che provo per te."],
  ["Una carezza in un pugno", "Adriano Celentano", "Con te anche la mia rabbia si scioglie in una carezza."],
  ["Ti amo", "Umberto Tozzi", "Ti amo, e non ho voglia di trovare parole più difficili di così."],
  ["Ti sento", "Matia Bazar", "Ti sento anche a distanza. Sei la mia frequenza preferita."],
  ["Vacanze romane", "Matia Bazar", "Con te ogni giorno feriale sembra una vacanza."],
  ["Sarà perché ti amo", "Ricchi e Poveri", "Sarà perché ti amo: che altro vuoi che sia questo tremore?"],
  ["Se mi lasci non vale", "Julio Iglesias", "Se mi lasci non vale, l'abbiamo detto. Quindi resta, per favore."],
  ["Caterina", "Perturbazione", "Piccole cose di te che non dimentico. Sono tante, sai."],
  ["Bacio a distanza", "Baustelle", "Ti mando un bacio a distanza, ma vorrei fosse sempre a un passo."],
  ["La guerra è finita", "Baustelle", "Con te la guerra è finita davvero. Adesso c'è solo pace."],
  ["Ti regalerò una rosa", "Simone Cristicchi", "Ti regalerei una rosa e mille cose ancora, se solo sapessi dirtele."],
  ["Meraviglioso", "Negramaro", "Che meraviglia sei, e quanto poco te ne accorgi."],
  ["Estate", "Negramaro", "La mia estate migliore ha il tuo nome e non finisce a settembre."],
  ["Baciami ancora", "Jovanotti", "Baciami ancora, che a certe cose non ci si abitua mai."],
  ["A te", "Jovanotti", "A te che sei semplicemente la cosa più importante che ho."],
  ["Bella", "Jovanotti", "Bella, di quella bellezza che non ha bisogno di specchi."],
  ["Per te", "Jovanotti", "Ho scritto mille cose, ma la più vera è semplice: per te farei di tutto."],
  ["L'ombelico del mondo", "Jovanotti", "Quando ci sei tu, il centro del mondo si sposta esattamente qui."],
  ["Sere nere", "Tiziano Ferro", "Anche le sere nere passano, se so che poi ci sei tu."],
  ["Il regalo più grande", "Tiziano Ferro", "Voglio farti un regalo: la certezza che ci sarò, sempre."],
  ["Ti scatterò una foto", "Tiziano Ferro", "Ti scatterei una foto per fermare esattamente questo istante con te."],
  ["Rosso relativo", "Tiziano Ferro", "Da quando ci sei tu, ogni cosa ha un colore in più."],
  ["Vivo per lei", "Andrea Bocelli e Giorgia", "Vivo per te, e ogni giorno lo scopro di nuovo."],
  ["Di sole e d'azzurro", "Giorgia", "Mi hai riempito di sole e d'azzurro una vita che era grigia."],
  ["Gocce di memoria", "Giorgia", "Ogni goccia di memoria che ho di te la tengo stretta."],
  ["E poi", "Giorgia", "E poi ci sei tu, che rendi tutto il resto un dettaglio."],
  ["Come saprei", "Giorgia", "Come saprei amarti se non ci fossi stata tu a insegnarmelo?"],
  ["La prima volta", "Giorgia", "Ti guardo e mi sembra sempre la prima volta. Ogni giorno."],
  ["Quando", "Pino Daniele", "Quando penso alla felicità, penso a un pomeriggio qualunque con te."],
  ["Napule è", "Pino Daniele", "Sei come la mia città: casa, con tutti i suoi rumori. E la amo."],
  ["Anna verrà", "Pino Daniele", "Verrai, lo so. E io sarò qui ad aspettarti, come sempre."],
  ["Che dio ci aiuti", "Antonello Venditti", "Che qualcuno lassù ci aiuti a restare così, io e te, ancora a lungo."],
  ["Ricordati di me", "Antonello Venditti", "Ricordati di me nei giorni belli. Nei brutti, ci penso io a ricordartelo."],
  ["Notte prima degli esami", "Antonello Venditti", "La notte prima di tutto, la cosa che mi calma sei tu."],
  ["Margherita", "Riccardo Cocciante", "E scriverò sui muri e per le strade il tuo nome, Margherita mia."],
  ["Bella senz'anima", "Riccardo Cocciante", "Anche quando litighiamo, alla fine resti la cosa più bella che ho."],
  ["Se stiamo insieme", "Riccardo Cocciante", "Se stiamo insieme ci sarà un perché. Il mio perché sei tu."],
  ["Cosa resterà degli anni '80", "Raf", "Passeranno gli anni e le mode, ma tu resterai la mia cosa preferita."],
  ["Il battito animale", "Raf", "Il mio cuore batte più forte quando ci sei. È così, punto."],
  ["Self Control", "Raf", "Con te perdo ogni controllo, e per una volta va benissimo così."],
  ["Sei nell'anima", "Gianna Nannini", "Sei nell'anima, e lì rimani. Non ti sposta più nessuno."],
  ["Meravigliosa creatura", "Gianna Nannini", "Meravigliosa creatura, sei sola al mondo per me."],
  ["Bello e impossibile", "Gianna Nannini", "Sembrava impossibile, e invece eccoci qui. Meno male."],
  ["Notti magiche", "Gianna Nannini", "Con te ogni notte è magica, anche senza motivo."],
  ["Dedicato", "Loredana Bertè", "Questa, come tante altre cose, è dedicata solo a te."],
  ["E la luna bussò", "Loredana Bertè", "Quando tutto tace, resta il tuo respiro accanto. E mi basta."],
  ["Cosa vuoi che sia", "Ligabue", "Cosa vuoi che sia una vita intera, se posso passarla con te."],
  ["Certe notti", "Ligabue", "Certe notti la strada non conta: conta con chi la fai. E io la faccio con te."],
  ["Ho messo via", "Ligabue", "Ho messo via un po' di cose, ma te no. Te ti tengo stretta."],
  ["Piccola stella senza cielo", "Ligabue", "Piccola stella, un cielo te lo do io. Basta che resti a brillare."],
  ["Hai un momento Dio?", "Ligabue", "Se avessi un momento chiederei una cosa sola: che tu resti."],
  ["Questa è la mia vita", "Ligabue", "Questa è la mia vita, e la parte migliore sei tu."],
  ["Ci vuole un fisico bestiale", "Luca Carboni", "Per amare come amo te ci vuole un cuore bestiale. E ce l'ho."],
  ["Mare mare", "Luca Carboni", "Mare mare, vorrei portarti dove l'orizzonte è largo come questo bene."],
  ["Le tue parole fanno male", "Enrico Ruggeri", "Anche quando fai male, resti la persona a cui torno sempre."],
  ["Quello che le donne non dicono", "Fiorella Mannoia", "So ascoltare anche quello che non dici. È lì che ti amo di più."],
  ["Il cielo d'Irlanda", "Fiorella Mannoia", "Ti porterei sotto un cielo grande come questo sentimento."],
  ["Come si cambia", "Fiorella Mannoia", "Cambiamo tutti, per amore. Io sono cambiato in meglio, grazie a te."],
  ["Sally", "Vasco Rossi", "La vita è un brivido che vola via, ma con te vola più piano e più bello."],
  ["Albachiara", "Vasco Rossi", "Respiri piano per non far rumore, e intanto mi riempi tutta la giornata."],
  ["Un senso", "Vasco Rossi", "Anche se questa vita un senso non ce l'ha, con te ce l'ha eccome."],
  ["Vivere", "Vasco Rossi", "Vivere, anche se sei morto dentro: con te ho ricominciato a farlo."],
  ["Ti prendo e ti porto via", "Vasco Rossi", "Ti prendo e ti porto via, lontano dalle giornate storte. Andiamo?"],
  ["Stupendo", "Vasco Rossi", "È stupendo, questo momento con te. Non svegliarmi, se sto sognando."],
  ["Gli anni", "Max Pezzali", "Gli anni passano, ma certe cose no. Come la voglia di stare con te."],
  ["Sei un mito", "Max Pezzali", "Per me sei un mito, di quelli veri. E ho la fortuna di conoscerti."],
  ["La dura legge del gol", "Max Pezzali", "Nella vita si vince e si perde, ma con te mi sento sempre in vantaggio."],
  ["Nord sud ovest est", "Max Pezzali", "Da qualunque parte tu vada, io ti seguo. Sono i miei quattro punti cardinali."],
  ["Con un deca", "Max Pezzali", "Non servono grandi cose: bastano una serata e tu, e sono a posto."],
  ["Tutto molto interessante", "Fabio Rovazzi", "Di tutto il caos del mondo, l'unica cosa che mi interessa davvero sei tu."],
  ["L'amore esiste", "Francesca Michielin", "L'amore esiste, e non è un'idea: ha la tua faccia."],
  ["Nessun grado di separazione", "Francesca Michielin", "Tra me e te non c'è nessun grado di separazione. Nemmeno uno."],
  ["Vorrei ma non posto", "J-Ax e Fedez", "Vorrei postare quanto ti amo, ma certe cose le tengo solo per noi."],
  ["Occhi lucidi", "Fedez", "Mi si lucidano gli occhi solo a pensare quanto sono fortunato ad averti."],
  ["Bellissima", "Annalisa", "Bellissima, e non solo di faccia. Dentro, soprattutto."],
  ["Mon Amour", "Annalisa", "Amore mio, di tutte le lingue del mondo, la mia preferita è il tuo nome."],
  ["Brividi", "Mahmood e Blanco", "Mi vengono i brividi ogni volta. Anche dopo tutto questo tempo."],
  ["Soldi", "Mahmood", "Non servono i soldi per essere ricchi. A me basti tu."],
  ["Notti in bianco", "Blanco", "Passerei mille notti in bianco solo per guardarti dormire."],
  ["Chiquitita", "ABBA", "Raccontami cosa non va: le tue spalle non le porti mai da sola."],
  ["The Winner Takes It All", "ABBA", "Non voglio vincere niente contro di te. Voglio solo restarci accanto."],
  ["I Have a Dream", "ABBA", "Ho un sogno, ed è semplice: una vita normale, con te dentro."],
  ["Take a Chance on Me", "ABBA", "Scommetti su di me: non te ne pentirai. Io su di te l'ho già fatto."],
  ["Dancing Queen", "ABBA", "Balla come quando avevi diciassette anni: ti guardo e mi innamoro daccapo."],
  ["Words", "Bee Gees", "Le parole mi mancano sempre, con te. Ma questo lo so dire: ti amo."],
  ["How Deep Is Your Love", "Bee Gees", "Quanto è profondo questo bene? Non ho ancora trovato il fondo."],
  ["To Love Somebody", "Bee Gees", "Non sai cosa vuol dire amare qualcuno... finché non tocca a te. Io lo so: sei tu."],
  ["More Than a Woman", "Bee Gees", "Sei più di tante cose messe insieme. Sei tutto, per come la vedo io."],
  ["Can't Take My Eyes Off You", "Frankie Valli", "Non riesco a staccarti gli occhi di dosso. E non ci provo nemmeno."],
  ["My Eyes Adored You", "Frankie Valli", "Ti ho adorata da lontano prima ancora di sfiorarti la mano."],
  ["Just My Imagination", "The Temptations", "Non è immaginazione: sei reale, sei qui, e sei mia. Che fortuna."],
  ["I'll Be There", "The Jackson 5", "Ovunque tu vada, ci sarò. Basta chiamare, e io arrivo."],
  ["I Want You Back", "The Jackson 5", "Se mai dovessi andare, ti verrei a riprendere. Ma resta, che è più semplice."],
  ["You Are the Sunshine of My Life", "Stevie Wonder", "Sei il sole della mia vita: per questo ti tengo sempre vicino."],
  ["Ribbon in the Sky", "Stevie Wonder", "C'è un filo che ci lega, sottile e resistente. Non si spezza."],
  ["Overjoyed", "Stevie Wonder", "Ti ho aspettata, e ne è valsa la pena. Ora traboccante di gioia."],
  ["Ain't Nobody", "Chaka Khan", "Nessuno mi fa stare come mi fai stare tu. Nessuno, davvero."],
  ["Sweet Love", "Anita Baker", "Un amore dolce, tranquillo, senza fretta: quello che ho con te."],
  ["Caught Up in the Rapture", "Anita Baker", "Perso in te, e non ho nessuna intenzione di ritrovarmi."],
  ["Distant Lover", "Marvin Gaye", "Anche quando sei lontana, ti sento addosso. Torna presto."],
  ["Let's Get It On", "Marvin Gaye", "Non serve fingere niente con te. Solo stare qui, io e te, adesso."],
  ["How Sweet It Is", "Marvin Gaye", "Che dolce è essere amati da te. Non lo do per scontato un solo giorno."],
  ["My Funny Valentine", "Chet Baker", "Con tutti i tuoi difetti buffi, non cambiare mai. Ti amo così."],
  ["I Fall in Love Too Easily", "Chet Baker", "Mi innamoro troppo in fretta, dicono. Di te non me ne pento affatto."],
  ["Time After Time", "Chet Baker", "Ogni volta, e poi ancora: ti sceglierei sempre daccapo."],
  ["Moon River", "Audrey Hepburn", "Due vagabondi in giro per il mondo: basta che il mondo lo giri con me."],
  ["La Bohème", "Charles Aznavour", "Eravamo giovani e felici, e non lo sapevamo. Con te lo so, adesso."],
  ["She", "Charles Aznavour", "Lei è tutto e il contrario di tutto, e io la amo in ogni sua versione."],
  ["Ne me quitte pas", "Jacques Brel", "Non lasciarmi. Te lo chiedo piano, ma lo penso forte."],
  ["La Mer", "Charles Trenet", "Come il mare, tu: cambi mille volte e resti sempre casa."],
  ["Les Champs-Élysées", "Joe Dassin", "In qualsiasi strada, a qualsiasi ora, se ci sei tu è la mia preferita."],
  ["Et si tu n'existais pas", "Joe Dassin", "E se tu non esistessi, dimmi tu per chi vivrei. Meglio non saperlo."],
  ["La vie en rose", "Édith Piaf", "Quando mi stringi, vedo la vita in rosa. E non voglio altri colori."],
  ["Hymne à l'amour", "Édith Piaf", "Per te farei cose enormi. Per fortuna a te basta che io resti."],
  ["Perhaps, Perhaps, Perhaps", "Doris Day", "Basta con i forse: io lo so già. Sei tu, senza dubbi."],
  ["Dream a Little Dream", "Doris Day", "Sogna un po' di me stanotte. Io lo faccio ogni notte con te."],
  ["Sea of Love", "Cat Power", "Vieni con me in questo mare d'amore: non ti lascio la mano, promesso."],
  ["The Greatest", "Cat Power", "Volevo essere il più grande. Poi ho capito: mi bastava essere il tuo."],
  ["First Day of My Life", "Melody Gardot", "La mia vera prima giornata è cominciata guardandoti. Il resto era prova."],
  ["Over the Rainbow", "Israel Kamakawiwo'ole", "Da qualche parte oltre l'arcobaleno c'è un posto per noi. Andiamoci."],
  ["Lucky Man", "The Verve", "Mi sento un uomo fortunato. E il motivo, guarda caso, sei tu."],
  ["Bittersweet Symphony", "The Verve", "La vita è una sinfonia agrodolce, e con te la parte dolce vince."],
  ["Sweet Disposition", "The Temper Trap", "Momenti rubati, corse a perdifiato: io li voglio tutti con te."],
  ["Ho Hey", "The Lumineers", "Io ti appartengo, tu appartieni a me. È tutto qui, ed è tutto."],
  ["Cherry Wine", "Hozier", "Ti amo di quell'amore paziente che aspetta, e resta, e non se ne va."],
  ["Like Real People Do", "Hozier", "Non chiedo il tuo passato: mi basta il presente, se lo tieni con me."],
  ["Make You Feel My Love", "Bob Dylan", "Non c'è niente che non farei per farti sentire quanto sei amata."],
  ["I Want You", "Bob Dylan", "Ti voglio, semplicemente. Senza clausole, senza forse."],
  ["Home", "Edward Sharpe & The Magnetic Zeros", "Casa è ovunque io sia con te. Non serve altro indirizzo."],
  ["First Time Ever I Saw Your Face", "Roberta Flack", "La prima volta che ho visto il tuo viso, ho pensato: eccola, è lei."],
  ["Killing Me Softly", "Roberta Flack", "Mi disarmi con dolcezza, ogni volta. E io mi arrendo felice."],
  ["Ain't No Sunshine", "Bill Withers", "Non c'è sole quando non ci sei. E le giornate sono troppo lunghe."],
  ["Lovely Day", "Bill Withers", "Basta uno sguardo tuo la mattina e so già che sarà una bella giornata."],
  ["Just the Two of Us", "Bill Withers", "Solo io e te, e il cielo sopra. Non mi serve una folla."],
  ["Lean on Me", "Bill Withers", "Appoggiati a me quando sei stanca: è per questo che ci sono."],
  ["Signed Sealed Delivered", "Stevie Wonder", "Consegnato a domicilio: il mio cuore, tutto tuo, per sempre."],
  ["This Guy's in Love with You", "Herb Alpert", "Ti guardo e spero che tu lo sappia: questo qui è pazzo di te."],
  ["Close to You", "The Carpenters", "Perché mi voglio stare accanto a te? Perché sei semplicemente tu."],
  ["We've Only Just Begun", "The Carpenters", "Abbiamo appena cominciato, tu ed io. E ho voglia di tutto il resto."],
  ["Top of the World", "The Carpenters", "Con te sono in cima al mondo, e la vista è meravigliosa."],
  ["Rainy Days and Mondays", "The Carpenters", "Anche i lunedì di pioggia diventano sopportabili, se ci sei tu."],
  ["Your Love", "The Outfield", "Non voglio perdere il tuo amore stanotte. Né nessun'altra notte."],
  ["Africa", "Toto", "Farei cose insensate pur di restarti vicino. Anche piovesse per sempre."],
  ["I Won't Give Up", "Jason Mraz", "Non mollo. Anche quando è dura, io su di noi non mollo."],
  ["Halo", "Beyoncé", "Vedo il tuo alone ovunque tu vada. Sei la mia luce, letteralmente."],
  ["XO", "Beyoncé", "Nel buio, tu sei la luce che tengo accesa. Sempre."],
  ["Adorn", "Miguel", "Lascia che il mio amore ti avvolga. È tutto quello che so fare bene."],
  ["Best Part", "Daniel Caesar", "Sei la parte migliore della mia giornata. Ogni giornata."],
  ["Location", "Khalid", "Dimmi solo dove sei: il resto della strada la trovo io."],
  ["Lost in Japan", "Shawn Mendes", "Attraverserei mezzo mondo solo per passare una sera con te."],
  ["Say You Won't Let Go", "James Arthur", "Promettimi che non lasci andare. Io ho già smesso di volerlo."],
  ["Thinking Out Loud", "Ed Sheeran", "Ti amerò anche a settant'anni, con la memoria che se ne va. Il tuo nome no."],
  ["Perfect", "Ed Sheeran", "Ho trovato una donna più forte di chiunque conosca. E balla con me al buio."],
  ["Photograph", "Ed Sheeran", "Ti tengo in una foto, dentro una tasca, vicino al cuore. Dove stai bene."],
  ["Kiss Me", "Sixpence None the Richer", "Baciami sotto la luce di mille lampioni: mi sembra sempre la prima volta."],
  ["Can't Help Falling in Love", "Haley Reinhart", "Certe cose sagge non si fanno. Innamorarsi di te è la più dolce delle follie."],
  ["Falling Like the Stars", "James Arthur", "Cadiamo insieme, come le stelle. Basta che cadiamo dalla stessa parte."],
  ["All of Me", "John Legend", "Ti do tutto di me, e prendo tutto di te. Anche le curve difficili."],
  ["Ordinary People", "John Legend", "Siamo persone normali, io e te. E non c'è niente di più bello."],
  ["Stay with Me", "Sam Smith", "Resta con me stanotte. E domani, e tutte le notti dopo, se ti va."],
  ["Latch", "Sam Smith", "Mi sono aggrappato a te, e non ho nessuna voglia di mollare."],
  ["Like I'm Gonna Lose You", "Meghan Trainor", "Ti amo come se potessi perderti domani. Così non do niente per scontato."],
  ["Lucky", "Jason Mraz e Colbie Caillat", "Sono fortunato ad aver amato la mia migliore amica. Sei sempre tu."],
  ["Bubbly", "Colbie Caillat", "Mi si accende tutto quando arrivi. Una specie di solletico al cuore."],
  ["The Way I Am", "Ingrid Michaelson", "Ti amo per come sei, senza condizioni. Non cambiare un pezzo."],
  ["Come On Get Higher", "Matt Nathanson", "Ti sento nelle ossa, come una canzone che non smetto di canticchiare."],
  ["Marry Me", "Train", "Non ho niente di pronto, solo la voglia di svegliarmi accanto a te per sempre."],
  ["Lucky Now", "Ryan Adams", "Non so se sono più saggio, ma con te di sicuro sono più felice."],
  ["Come Pick Me Up", "Ryan Adams", "Vieni a prendermi quando cado. So che lo fai. Lo fai sempre."],
  ["Harvest Moon", "Neil Young", "Voglio ancora ballare con te sotto questa luna. Come la prima volta."],
  ["Only Love Can Break Your Heart", "Neil Young", "Solo l'amore può ferirti, dicono. Il nostro invece mi guarisce."],
  ["Into the Mystic", "Van Morrison", "Navighiamo insieme nel mistero, io e te. Non mi serve la mappa."],
  ["Crazy Love", "Van Morrison", "Un amore folle, del tipo che ti tira su nei giorni pesanti."],
  ["Sweet Thing", "Van Morrison", "Cosa dolce mia, cammineremo tra i giardini bagnati di pioggia. Insieme."],
  ["These Arms of Mine", "Otis Redding", "Queste braccia ti aspettano. Vieni, che qui stai al sicuro."],
  ["That's How Strong My Love Is", "Otis Redding", "Il mio amore è forte come il sole d'estate: non ti abbandona mai."],
  ["I've Been Loving You Too Long", "Otis Redding", "Ti amo da troppo tempo per smettere adesso. E non voglio."],
  ["A Change Is Gonna Come", "Sam Cooke", "Le cose cambieranno in meglio, lo so. Intanto ho te, ed è già tanto."],
  ["Cupid", "Sam Cooke", "Cupido, per una volta hai fatto centro: mi hai fatto incontrare lei."],
  ["Bring It On Home to Me", "Sam Cooke", "Torna a casa da me. Ti aspetto con la luce accesa."],
  ["I Say a Little Prayer", "Aretha Franklin", "Ogni mattina, ancora prima di alzarmi, la mia prima preghiera sei tu."],
  ["Natural Woman", "Carole King", "Mi fai sentire semplicemente me stessa. Nessuno ci era mai riuscito."],
  ["So Far Away", "Carole King", "Sei lontana e mi manchi, ma so che torni. È questo che mi tiene su."],
  ["Will You Love Me Tomorrow", "Carole King", "Mi amerai anche domani? Io sì, e anche dopodomani, sta' tranquilla."],
  ["It's Too Late", "Carole King", "Anche quando è difficile, con te ci provo lo stesso. Sempre."],
  ["Beautiful", "Carole King", "Sei bella. E quando lo dimentichi, è compito mio ricordartelo."],
  ["Vincent", "Don McLean", "Vedo il mondo con i colori che gli dai tu. Meno male che ci sei."],
  ["If", "Bread", "Se una foto potesse dire mille parole, la tua direbbe solo: casa."],
  ["Everything I Own", "Bread", "Darei tutto quello che ho per un giorno in più accanto a te."],
  ["Make It with You", "Bread", "Con te ce la posso fare. Con te ho voglia di provarci, qualunque cosa."],
  ["Wonderful World", "Sam Cooke", "Non saprò tante cose, ma so questo: ti amo. E mi basta."],
  ["My Sweet Lord", "George Harrison", "Ti voglio davvero vicino: sei la mia cosa più vera."],
  ["Here, There and Everywhere", "The Beatles", "Qui, lì, e in ogni dove: ovunque tu sia, io ci voglio essere."],
  ["Michelle", "The Beatles", "Ti direi che ti amo in tutte le lingue che conosco. E in quelle che non conosco."],
  ["If I Fell", "The Beatles", "Se mi innamoro, dev'essere per sempre. Con te lo è."],
  ["I Will Always Love You", "Whitney Houston", "Qualunque cosa succeda, io ti amerò sempre. È una promessa, non una frase."],
  ["Greatest Love of All", "Whitney Houston", "Ti ho insegnato ad amarti? No: sei stata tu a insegnarlo a me."],
  ["Saving All My Love for You", "Whitney Houston", "Metto da parte tutto il mio amore, e lo tengo solo per te."],
  ["When I Fall in Love", "Nat King Cole", "Quando mi innamoro, è per sempre. E infatti eccomi qui, con te."],
  ["Smile", "Nat King Cole", "Sorridi, anche quando il cuore fa male. Al resto ci penso io."],
  ["Nature Boy", "Nat King Cole", "La cosa più grande che imparerai è amare ed essere amata. Grazie di insegnarmelo."],
  ["Autumn Leaves", "Nat King Cole", "Cadono le foglie, passano le stagioni, ma tu resti. Ed è tutto."],
  ["Beyond the Sea", "Bobby Darin", "Oltre il mare c'è lei che aspetta. E io remo, contento, verso casa."],
  ["Dream Lover", "Bobby Darin", "Ho sognato una come te per una vita. Poi sei arrivata davvero."],
  ["Can't Take My Eyes Off You", "Lauryn Hill", "Sei troppo bella per essere vera, eppure eccoti. E io non ci credo ancora."],
  ["Killing Me Softly With His Song", "Fugees", "Con dolcezza mi disarmi ogni volta. E ogni volta mi arrendo felice."],
  ["Ordinary World", "Duran Duran", "Nel mondo di tutti i giorni, tu sei la cosa straordinaria."],
  ["Come Undone", "Duran Duran", "Con te mi lascio andare, senza paura di cadere. Tanto ci sei tu."],
  ["Save a Prayer", "Duran Duran", "Non è solo per una notte: è per tutte quelle che verranno."],
  ["True", "Spandau Ballet", "Questo è tutto quello che so dire, ma è vero: ti amo, davvero."],
  ["Gold", "Spandau Ballet", "Sei oro puro, indistruttibile. E hai il coraggio di sapere di valere."],
  ["Hold Me Now", "Thompson Twins", "Stringimi ora, e non parliamo del resto. Ci pensiamo domani."],
  ["Everywhere", "Fleetwood Mac", "Ti voglio ovunque, sempre. Vieni, apri il tuo cuore, che il mio è già spalancato."],
  ["Dreams", "Fleetwood Mac", "Nel silenzio, si sente cosa conta davvero. E per me conti tu."],
  ["Say You Love Me", "Fleetwood Mac", "Dimmi che mi ami, anche se lo so. Fa bene sentirlo, ogni volta."],
  ["The Chain", "Fleetwood Mac", "La nostra catena non si spezza. L'abbiamo forgiata insieme, un giorno alla volta."],
  ["Wildflowers", "Tom Petty", "Sei nata per essere libera. Corri pure: io tifo per te, sempre."],
  ["Angel", "Sarah McLachlan", "Ti prendo io sotto l'ala nei giorni pesanti. Riposa, che veglio."],
  ["I Will Remember You", "Sarah McLachlan", "Mi ricorderò di te, di tutto, per sempre. Non perdo un dettaglio."],
  ["Truly Madly Deeply", "Savage Garden", "Sarò il tuo sogno, il tuo desiderio, il tuo tutto. Ci sto provando, sul serio."],
  ["I Knew I Loved You", "Savage Garden", "Ti amavo ancora prima di conoscerti. Ora so persino perché."],
  ["Kiss from a Rose", "Seal", "Sei diventata la luce nel mio buio. Come una rosa cresciuta sulla pietra."],
  ["Fast Car", "Tracy Chapman", "Sali, che partiamo. Basta un'auto e tu, e ci sentiamo appartenere a qualcosa."],
  ["The Promise", "Tracy Chapman", "Se aspetti, io torno. È una promessa, e le promesse le mantengo."],
  ["Baby Can I Hold You", "Tracy Chapman", "Certe parole non le diciamo mai. Ma questa te la dico: scusa. E: ti amo."],
  ["Have I Told You Lately", "Van Morrison", "Te l'ho detto ultimamente quanto ti amo? Nel dubbio: da morire."],
  ["Brown Eyed Girl", "Van Morrison", "Ragazza dagli occhi scuri, ridiamo ancora come quel giorno al fiume."],
  ["Wonderwall", "Oasis", "Forse sei tu quella che mi salva, alla fine. Anzi, ne sono sicuro."],
  ["Stop Crying Your Heart Out", "Oasis", "Smetti di piangere: le stelle brillano ancora, e io sono qui."],
  ["Songbird", "Oasis", "Sei l'unica per cui ho mai provato tutto questo. E lo sai."],
  ["She's Electric", "Oasis", "Con te la vita è elettrica, imprevedibile, bellissima. Non cambiare."],
  ["Half the World Away", "Oasis", "Anche a mezzo mondo di distanza, il mio pensiero è sempre a casa, da te."],
  ["Fade Into You", "Mazzy Star", "Vorrei sfumare dentro di te, piano piano, e restarci."],
  ["The Blower's Daughter", "Damien Rice", "Non riesco a smettere di guardarti. Ci ho provato: non funziona."],
  ["Cannonball", "Damien Rice", "Basta poco per innamorarsi. E ancora meno per restarci. Con te, niente."],
  ["9 Crimes", "Damien Rice", "Con tutti i nostri sbagli, resto qui. Perché con te sbagliare è meno grave."],
  ["Falling Slowly", "Glen Hansard e Markéta Irglová", "Cadiamo piano, io e te. E per una volta non ho paura di atterrare."],
  ["Your Body Is a Wonderland", "John Mayer", "Con te il tempo si ferma. E io non ho nessuna fretta che riparta."],
  ["Gravity", "John Mayer", "Tienimi giù tu, che da solo volerei via. Sei la mia gravità buona."],
  ["Slow Dancing in a Burning Room", "John Mayer", "Anche quando tutto va a fuoco, con te ballo lento. Perché ne vale la pena."],
  ["Comfortable", "John Mayer", "Con te sto comodo come in una domenica di pioggia. E non chiedo altro."],
  ["Banana Pancakes", "Jack Johnson", "Restiamo a letto, facciamo finta che fuori diluvi. Solo noi due."],
  ["Angela", "The Lumineers", "Torna a casa, Angela. Qui c'è qualcuno che ti tiene il posto caldo."],
  ["Stubborn Love", "The Lumineers", "Meglio amare e sentire, anche quando fa male, che non amare affatto. Con te scelgo di sentire."],
  ["Flowers in Your Hair", "The Lumineers", "Ci vuole coraggio a diventare grandi, e a restare gentili. Tu li hai entrambi."],
  ["Skinny Love", "Birdy", "Amiamoci per bene, senza mezze misure. Ne vale la pena, sempre."],
  ["People Help the People", "Birdy", "Lascia che ti aiuti quando pesa. Le persone servono a questo. Io a questo."],
  ["Not About Angels", "Birdy", "Non parliamo di quanto durerà. Parliamo di quanto è bello adesso, con te."],
  ["Latch", "Sam Smith", "Mi sono aggrappato a te dalla prima sera. E non mollo la presa."],
  ["Say Something", "A Great Big World", "Dimmi qualcosa e io ti seguo. Ovunque, anche al buio."],
  ["All of the Stars", "Ed Sheeran", "Guardiamo le stesse stelle, da qualunque parte tu sia. Ci sentiamo lì."],
  ["Tenerife Sea", "Ed Sheeran", "Ti guardo e penso: come faccio a essere così fortunato?"],
  ["Kiss Me", "Ed Sheeran", "Baciami come se fosse la prima volta. A me sembra sempre così."],
  ["Hold On", "Chord Overstreet", "Tieni duro, ti prego: io ho ancora bisogno di te. Tantissimo."],
  ["Love Somebody", "Maroon 5", "Voglio amare qualcuno come amo te. Ma tanto quella persona sei sempre tu."],
  ["Sugar", "Maroon 5", "Sei il mio zucchero: senza di te la giornata è amara. Con te, dolce."],
  ["She Will Be Loved", "Maroon 5", "Ci sarò sotto la pioggia, quando ne avrai bisogno. Sempre."],
  ["Sunday Morning", "Maroon 5", "Una domenica mattina, la pioggia fuori e tu accanto: la mia idea di paradiso."],
  ["Lost", "Frank Ocean", "Anche persa, in mezzo al caos, resti la cosa più bella che io veda."],
  ["Thinkin Bout You", "Frank Ocean", "Penso a te più di quanto ammetta. Cioè: praticamente sempre."],
  ["Come Away with Me", "Norah Jones", "Portami via dove vuoi tu. Basta che ci sia il tuo sorriso all'arrivo."],
  ["Don't Know Why", "Norah Jones", "Non so perché, ma da quando ci sei tu ha tutto più senso."],
  ["Turn Me On", "Norah Jones", "Come una lampada spenta al mattino, aspetto solo te per accendermi."],
  ["Sunrise", "Norah Jones", "Ogni alba con te vale la pena di svegliarsi. Anche presto."],
  ["The Luckiest", "Ben Folds", "Non so bene come, ma sono il più fortunato del mondo. Perché ho te."],
  ["You Don't Know Me", "Ben Folds e Regina Spektor", "Ti conosco meglio di chiunque, e più ti conosco più ti amo."],
  ["Samson", "Regina Spektor", "Ti ho amata prima ancora di sapere il tuo nome. E ora che lo so, di più."],
  ["Us", "Regina Spektor", "Noi due contro il resto: mi piace come suona. Facciamolo per sempre."],
  ["The Book of Love", "Magnetic Fields", "Il libro dell'amore è lungo e noioso. Con te non salterei nemmeno una nota."],
  ["Que Sera, Sera", "Doris Day", "Qualunque cosa sarà, sarà. Ma se la scopriamo insieme, non ho paura."],
  ["La Vie en Rose", "Grace Jones", "Con te vedo la vita in rosa, e non voglio guarire da questo effetto."],
  ["Fever", "Peggy Lee", "Mi fai venire la febbre, e non c'è medicina che io voglia prendere."],
  ["The Very Thought of You", "Billie Holiday", "Basta il solo pensiero di te per farmi sorridere da solo, come uno scemo."],
  ["I'll Be Seeing You", "Billie Holiday", "Ti ritroverò in ogni posto bello. Perché ormai sei ovunque, per me."],
  ["The Way You Look Tonight", "Tony Bennett", "Un giorno, quando sarò vecchio, ricorderò te esattamente stasera."],
  ["Because of You", "Tony Bennett", "Grazie a te, c'è musica ovunque io vada. E la giro cantandola."],
];

import { readFileSync, existsSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (t, a) => `${t}|${a}`;
const CACHE = new URL("./dedications-cache.json", import.meta.url);

// Persistent cache: { "title|artist": deezerUrl }. Deezer's API is generous
// (300 calls resolve in ~30s), so this is mostly for safe restarts.
let cache = {};
if (existsSync(CACHE)) { try { cache = JSON.parse(readFileSync(CACHE, "utf8")); } catch { cache = {}; } }
const flushCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 0));

async function fetchT(url, ms = 10000) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { signal: ac.signal }); }
  finally { clearTimeout(to); }
}

/** Resolve one song to a deezer.com/track/<id> url via the Deezer API. */
async function resolveOne(t, a) {
  const tryQuery = async (q) => {
    let res;
    try { res = await fetchT(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`); }
    catch { return null; }
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const r = j && (j.data || [])[0];
    return r && r.id ? `https://www.deezer.com/track/${r.id}` : null;
  };
  // structured first (precise), then a loose fallback
  return (await tryQuery(`track:"${t}" artist:"${a}"`)) || (await tryQuery(`${t} ${a}`));
}

async function resolveList(list, label) {
  const out = [];
  for (const item of list) {
    const [t, a] = item;
    let url = cache[key(t, a)];
    if (!url) {
      for (let attempt = 0; attempt < 3 && !url; attempt++) {
        url = await resolveOne(t, a);
        if (!url) await sleep(500);
      }
      if (url) { cache[key(t, a)] = url; flushCache(); }
      await sleep(150);
    }
    if (url) out.push({ ...item, url });
    else console.log(`  MISS (${label}): ${t} — ${a}`);
  }
  return out;
}

const dry = process.argv.includes("--dry");

// Support songs get resolved too, so everything is uniform Deezer.
const SUPPORT = [
  ["Fix You", "Coldplay", "Non devi aggiustarti da sola: io ci sono, anche per i pezzi."],
  ["The Scientist", "Coldplay", "Smetti di riavvolgere il nastro. Il posto migliore da cui guardare è qui, adesso."],
  ["Beautiful Day", "U2", "Anche nelle giornate storte c'è un momento buono. Di solito è piccolo: cercalo."],
];

const loveResolved = await resolveList(SONGS, "love");
const supportResolved = await resolveList(SUPPORT, "support");

// Dedup by Deezer track id: some same-title songs resolve to the same track,
// and duplicate ids would collide in the daily pick + text map. Seed the set
// with the support tracks so a love entry never clashes with them either.
const idOf = (u) => (/track\/(\d+)/.exec(u) || [])[1];
const seen = new Set(supportResolved.map((d) => idOf(d.url)).filter(Boolean));
const loveUnique = loveResolved.filter((d) => {
  const id = idOf(d.url);
  if (!id || seen.has(id)) return false;
  seen.add(id); return true;
});

const final = loveUnique.slice(0, 300);
console.log(`\nLove risolti: ${loveResolved.length}/${SONGS.length} · unici: ${loveUnique.length} · support: ${supportResolved.length}/3 · final: ${final.length}`);
if (final.length < 300) { console.log(`⚠ Solo ${final.length} (<300). Rilancia (riprende dalla cache) o aggiungi canzoni.`); process.exit(2); }
console.log(`✓ ${final.length} dediche pronte.`);
if (dry) process.exit(0);

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const toEntry = (d) =>
  `  { title: "${esc(d[0])}", artist: "${esc(d[1])}", year: 0, text: "${esc(d[2])}", url: "${esc(d.url)}" },`;
const loveBody = final.map(toEntry).join("\n");
const supportBody = supportResolved.map(toEntry).join("\n");

const file = `/**
 * dedications.ts — le canzoni dedicate. GENERATO da build-dedications.mjs:
 * ogni brano è risolto al suo brano su Deezer (API pubblica, nessuna chiave),
 * così il player a incorporo (widget.deezer.com) lo suona direttamente.
 *
 * ${final.length} dediche: una canzone e una dedica per OGNI giorno, in
 * rotazione deterministica (vedi dailyIndex in music.ts) — mai un giorno
 * senza. "support" risponde al pulsante delle giornate no.
 *
 * Per rigenerare/ampliare:  node build-dedications.mjs
 */

export interface Dedication {
  title: string;
  artist: string;
  year: number;
  /** the message written for her — the heart of the gift. */
  text: string;
  /** deezer.com/track/<id> url (feeds the official embed player). */
  url: string;
}

export const LOVE_DEDICATIONS: Dedication[] = [
${loveBody}
];

export const SUPPORT_DEDICATIONS: Dedication[] = [
${supportBody}
];

/**
 * Ogni giorno ha la sua dedica: la canzone del giorno pesca sempre dalla
 * pool delle dediche (vedi SongWidget), quindi non serve più distinguere i
 * giorni. La domenica resta comunque un "giorno da dedica" per compatibilità.
 */
export function isDedicationDay(_dateStr: string): boolean {
  return true;
}
`;

writeFileSync(new URL("./src/dedications.ts", import.meta.url), file);
console.log("src/dedications.ts scritto.");
