# MD Scraper — Bolle e Rese (edicole.m-d.srl)

Programma che accede automaticamente al portale **MD online** (`http://edicole.m-d.srl`)
con le tue credenziali, scarica i dati di **Bolla** e **Resa** per le categorie
**A Quotidiani** e **C Mista** del giorno corrente, li memorizza in uno storico
e li espone sia come pagina HTML sia come **API HTTP in JSON**, in modo che
altri progetti possano leggerli via Internet.

Lo scraper può essere eseguito localmente o a intervalli con GitHub Actions.
In quest'ultimo caso i report sono pubblicati su GitHub Pages (vedi la
configurazione qui sotto).

## ⚠️ Attenzione: API senza protezione

L'API **non ha nessuna autenticazione**: chiunque conosca
l'indirizzo può leggere tutti i dati (titoli, prezzi, date, copie). Non
contiene username/password (che vanno salvate nei secrets di GitHub Actions), ma
contiene i dati commerciali dell'edicola. Se in futuro vuoi proteggerla con
una chiave API, fammelo sapere.

## Struttura del progetto

```
md-scraper/
├── .env                  # Credenziali per uso LOCALE (NON condividere, NON committare)
├── .env.example           # Modello del file .env
├── index.js               # Esecuzione manuale una tantum (uso locale/debug)
├── server.js              # Server web/API e scheduler, per l'esecuzione continua
├── .github/workflows/       # Scraping programmato e pubblicazione GitHub Pages
├── Dockerfile              # Immagine per il deploy containerizzato
├── fly.toml                 # Configurazione Fly.io (opzionale)
├── .dockerignore
├── data/                   # (locale) Storico e log quando si usa index.js in locale
│   ├── history.json
│   └── run.log
└── src/
    ├── mdClient.js          # Login e recupero pagine autenticate
    ├── parse.js              # Estrazione dei dati dalle pagine Bolla/Resa
    ├── store.js              # Lettura/scrittura dello storico (locale o volume cloud)
    ├── report.js             # Generazione della pagina HTML
    ├── publish.js            # Generazione delle pagine statiche/API
    └── run.js                # Logica di scraping condivisa (usata da index.js e server.js)
```

## API disponibili (per collegare altri progetti)

Base URL: l'indirizzo del servizio che ospita i dati (con GitHub Pages:
`https://<proprietario>.github.io/<repository>`).

| Endpoint | Descrizione |
|---|---|
| `GET /health` | Verifica che il servizio sia attivo |
| `GET /api/latest` | Dati completi dell'ultimo giorno scaricato (tutte le categorie, con titoli, prezzi, copie, date) |
| `GET /api/history` | Storico completo di tutti i giorni scaricati finora (vedi "Storico e backfill" sopra: lo scheduler mantiene sempre aggiornata la finestra di backfill, ma non cancella mai i giorni precedenti) |
| `GET /api/history/17-10-2026` | Dati di un giorno specifico (formato `gg-mm-aaaa` nell'URL) |
| `GET /report` | Pagina HTML leggibile con gli stessi dati (utile per controllo visivo). Mostra il dettaglio completo dell'ultimo giorno, più una tabella "Storico" con i totali di tutti i giorni scaricati |
| `GET /report/17-10-2026` | Dettaglio HTML completo (titoli, prezzi, copie) di un giorno specifico (formato `gg-mm-aaaa`), raggiungibile anche cliccando sulla data nella tabella "Storico" di `/report` |

## Compatibilità con il formato i2 (per progetti che fanno già scraping di edicole.m-d.srl)

Se un altro progetto legge già l'HTML del portale i2 (stessa struttura:
`table#dlBolla`/`#dlResa`, span `lblNumero`/`lblPrezzo`/`lblPrezzoNetto`/
`lblCopie`/`lblTestata`, ecc. — es. con un parser basato su cheerio), questo
servizio espone le **stesse identiche rotte URL** del sito reale, popolate
con i dati già scaricati, **senza bisogno di login**. Queste pagine
funzionano per **qualsiasi data presente nello storico** (grazie al backfill
automatico, vedi la finestra configurata sotto, ma anche oltre se già
scaricati in precedenza): basta cambiare la data nell'URL con lo stesso
formato/nome usato dal sito originale per leggere il giorno desiderato.

| Endpoint compatibile i2 | Equivalente sul sito reale |
|---|---|
| `GET /Bolla.htm-17/10/2026-A` | Bolla "A Quotidiani" del giorno |
| `GET /Bolla.htm-17/10/2026-C` | Bolla "C Mista" del giorno |
| `GET /Resa.htm-17/10/2026-A-A%20Quotidiani` | Resa "A Quotidiani" del giorno |
| `GET /Resa.htm-17/10/2026-C-C%20Mista` | Resa "C Mista" del giorno |

Per usarlo da un altro progetto che fa scraping diretto di i2, basta
**cambiare l'indirizzo base** (da `http://edicole.m-d.srl` a
`https://md-scraper-lacoccinella.fly.dev`) e **saltare il login** (non serve):
il parser esistente continua a funzionare senza modifiche, perché la
struttura HTML (id di tabelle/span) è la stessa.

> ✅ Verificato: la generazione HTML in `src/i2Compat.js` è stata testata
> facendo girare il parser reale di [ACTA](https://github.com/Bycyb75/ACTA)
> (`utils/i2Parser.js`, non modificato) sull'HTML prodotto da questo
> servizio: tutti i campi (titolo, numero, codice testata, prezzi, copie)
> corrispondono esattamente ai dati originali.
>
> Limite noto: le sezioni della Resa (es. "Ultima resa di", "Resa del conto
> deposito") non vengono distinte: tutte le righe sono emesse sotto un'unica
> sezione generica "RESA". Se servisse distinguerle, si può estendere
> `src/i2Compat.js` in un secondo momento.

Esempio di chiamata dall'altro progetto (qualsiasi linguaggio che sappia fare
una richiesta HTTP GET e leggere JSON):

```
GET https://md-scraper-lacoccinella.fly.dev/api/latest
```

Risposta (esempio semplificato):
```json
{
  "data": "19/10/2026",
  "timestamp": "2026-10-19T08:26:42.406Z",
  "categorie": {
    "A Quotidiani": {
      "bolla": { "numeroTitoli": 19, "items": [ { "titolo": "AFFARI & FINANZA", "prezzoLordo": 3.5, "copieFornite": 3, "...": "..." } ] },
      "resa": { "numeroTitoli": 20, "items": [ "..." ] }
    },
    "C Mista": { "bolla": { "numeroTitoli": 0, "items": [] }, "resa": { "numeroTitoli": 0, "items": [] } }
  }
}
```

## Come funziona

1. **Login**: lo script riproduce la chiamata usata dal sito stesso
   (`/Account/Login.aspx/LogMeIn`) usando le credenziali (in cloud: i secrets
   di GitHub Actions; in locale: il file `.env`).
2. **Download**: scarica le pagine `Bolla.htm-<data>-A`, `Bolla.htm-<data>-C`,
   `Resa.htm-<data>-A-A Quotidiani`, `Resa.htm-<data>-C-C Mista`.
3. **Estrazione**: analizza le tabelle HTML ed estrae titolo, codice Fieg, copie
   fornite, prezzi, copie rese/dichiarate, conto deposito e differenze per ogni titolo.
4. **Storico**: i dati del giorno vengono salvati/aggiornati in
   `data/history.json`; con GitHub Actions lo storico persistente è pubblicato
   nel branch `gh-pages`. Una volta scaricati, i dati di un
   giorno **non vengono mai cancellati** dallo storico: restano disponibili
   per sempre (via API e via pagine compatibili i2, vedi sotto).
5. **Report/API**: vengono rigenerati sia la pagina HTML sia i dati
   interrogabili via API.
6. **Backfill automatico**: ad ogni ciclo lo scheduler non controlla solo il
   giorno corrente ma un'intera **finestra di giorni precedenti** (default
   14, configurabile con `BACKFILL_GIORNI` — nel workflow GitHub impostata a
   **7**, vedi sotto), per recuperare automaticamente
   eventuali giorni non scaricati (es. perché il servizio è rimasto fermo, o
   l'edicola è rimasta chiusa). Se un giorno risulta già definitivo nello
   storico non viene toccato (nessuna richiesta di rete); se mancano o sono
   incompleti più giorni, viene fatto **un solo login** e vengono scaricati
   in sequenza solo quelli mancanti.

## Esecuzione programmata gratuita (GitHub Actions + GitHub Pages)

Il workflow `.github/workflows/scrape-publish.yml` avvia lo scraping ogni
20 minuti, senza lasciare una macchina accesa. Quando i dati del giorno sono
definitivi, la logica in `src/run.js` evita altre richieste di scraping per
quel giorno; i successivi avvii programmati controllano lo stato e riprendono
il lavoro quando serve. GitHub può ritardare l'avvio degli eventi pianificati,
quindi non è un orario garantito al minuto.

Al termine, il workflow pubblica report e dati statici sul branch `gh-pages`.
Lo storico `data/history.json` viene mantenuto su quel branch e ricaricato
all'avvio successivo, così non si perdono i giorni già scaricati.

Per attivarlo:

1. Pubblica il progetto in un repository GitHub. Lo scraping e l'API attuali
   espongono dati senza autenticazione: rendi pubblico il repository solo se
   vuoi che anche codice e dati pubblicati siano pubblici. Non caricare mai
   `.env`; le credenziali vanno aggiunte come *Actions secrets* chiamati
   `MD_BASE_URL`, `MD_USERNAME` e `MD_PASSWORD`.
2. In **Settings → Secrets and variables → Actions**, crea i secrets
   `MD_BASE_URL`, `MD_USERNAME` e `MD_PASSWORD`.
3. In **Settings → Actions → General**, consenti ai workflow di leggere e
   scrivere contenuti del repository (permesso `Contents: Read and write`).
4. Avvia **Scrape and publish** una prima volta da **Actions → Run workflow**:
   così il workflow crea il branch `gh-pages` e pubblica i file.
5. In **Settings → Pages**, seleziona **Deploy from a branch**, il branch
   `gh-pages` e la cartella `/ (root)`.

L'indirizzo Pages sarà `https://<proprietario>.github.io/<repository>/`.
Sono mantenuti gli endpoint, aggiungendo il prefisso Pages:

- `/report/` e `/report/17-10-2026/` per il report e i dettagli giornalieri;
- `/api/latest` e `/api/history` per i dati JSON;
- `/api/history/17-10-2026` per un singolo giorno;
- le rotte HTML compatibili con i2, ad esempio
  `/Bolla.htm-17/10/2026-A`.

GitHub Actions usa i minuti gratuiti secondo il tipo di repository e il piano
dell'account. GitHub Pages è pubblico con questa configurazione: chi conosce
il link può leggere i dati. Verifica l'uso incluso nella pagina **Billing** di
GitHub. Lo storico già esistente in `data/history.json` viene usato come base
al primo avvio, prima che sia creato il branch `gh-pages`.

### Comportamento dello scraping

- **A Quotidiani** arriva tutti i giorni: se la bolla risulta vuota, il sito
  non l'ha ancora pubblicata, quindi si ritenta.
- **C Mista** non viene consegnata tutti i giorni (tipicamente manca la
  domenica e il lunedì, quando esce solo "A Quotidiani"): se il sito risponde
  correttamente ma senza titoli, è un esito finale legittimo e **non** si
  ritenta più fino al cambio data. In quei giorni restano quindi solo le 2
  pagine di "A Quotidiani" (Bolla + Resa) invece delle 4 complessive
  (Bolla/Resa per "A Quotidiani" + Bolla/Resa per "C Mista").
- Se un giorno della finestra è già definitivo, non viene fatta nessuna
  richiesta di rete per quel giorno. Se invece mancano o sono incompleti uno
  o più giorni (es. il servizio era fermo da qualche giorno), viene fatto
  **un solo login** e si scaricano in sequenza solo i giorni mancanti, così
  da non perdere le bolle anche se non si scarica tutti i giorni.
- I dati scaricati restano nello storico **senza scadenza**: la finestra di
  backfill regola solo quanto indietro lo scheduler prova *attivamente* a
  recuperare i giorni mancanti, non per quanto tempo i dati già scaricati
  vengono conservati.

## Esecuzione manuale in locale (opzionale, per test/debug)

```powershell
cd D:\md-scraper
npm run scrape
```

Senza argomenti, `npm run scrape` scarica/completa
l'intera finestra di backfill (default 14 giorni, oggi + 13 precedenti; in
locale non è impostata la variabile `BACKFILL_GIORNI`, quindi usa il default
del codice, diverso dai 7 giorni configurati nel workflow cloud), non solo il
giorno corrente, utile per recuperare in un colpo solo eventuali giorni persi.

Per scaricare/forzare **una singola data specifica** (formato gg/mm/aaaa),
ignorando il resto della finestra:

```powershell
node index.js 16/10/2026
```

Questo usa il file `.env` locale e scrive in `data/history.json` e
`report.html` **nella cartella del progetto**.

> Nota: se usi anche il Task Scheduler di Windows, disattivalo quando avvii
> GitHub Actions per evitare scraping duplicati.

## Sicurezza delle credenziali

- **In locale**: le credenziali sono solo nel file `.env`, mai nel codice.
- **In cloud**: le credenziali sono salvate come *secrets* di GitHub Actions,
  non nel codice sorgente.
- L'API dei dati (vedi sopra) è invece **pubblica e senza password**, per
  scelta esplicita: contiene dati commerciali ma non le credenziali di accesso.

## Log ed errori

- **In cloud**: la scheda **Actions** del repository mostra log e stato di
  ogni esecuzione programmata.
- **In locale**: ogni esecuzione di `npm run scrape` scrive un log in
  `data/run.log`.
