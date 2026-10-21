# Importa Bolle Automatico

Scarica periodicamente le bolle I2 (arrivi/rese, quotidiani/mista) e pubblica
la cache come JSON statico. GitHub Actions avvia un'esecuzione ogni 20 minuti:
quando non ci sono bolle da scaricare, il job salta login e richieste al portale.
I job non mantengono una macchina accesa.

## Configurazione GitHub Actions e Pages

1. Nel repository GitHub apri **Settings → Secrets and variables → Actions**
   e aggiungi questi repository secrets:
   - `I2_USERNAME`
   - `I2_PASSWORD`
   - `I2_EDICOLAID` (per esempio `1630`)
2. In **Settings → Actions → General**, consenti ai workflow di leggere e
   scrivere contenuti del repository.
3. Avvia **Actions → Scrape and publish cache → Run workflow**.
4. Dopo la prima esecuzione, apri **Settings → Pages**, seleziona **Deploy from
   a branch**, branch `gh-pages`, cartella `/ (root)`.
5. Attendi che GitHub Pages completi la pubblicazione. L'indirizzo sarà
   `https://bycyb75.github.io/Importabolle/`.

Le esecuzioni pianificate possono partire in ritardo e non sono garantite al
minuto. Se mancano i secrets o il login fallisce, il job risulta fallito e la
cache precedente resta pubblicata. Il repository e la cache su Pages sono
pubblici: non inserire credenziali o dati che non vuoi rendere pubblici.
Le credenziali sono usate soltanto come secrets dal job e non vengono
pubblicate.

La prima esecuzione parte dalla cache disponibile nel branch `gh-pages`.
La cache che si trova solo su un eventuale vecchio container Northflank non
viene trasferita automaticamente. Dopo aver verificato che Pages funzioni,
ferma il servizio Northflank per evitare scraping duplicati.

## API JSON statiche

GitHub Pages non esegue un server Node e non supporta la vecchia API con query
string (`/api/cache/bolla?edicolaid=...`). Scarica invece la stessa risposta
JSON da un URL con i parametri nel percorso:

```text
GET https://bycyb75.github.io/Importabolle/api/cache/bolla/1630/arrivi/quotidiani/2026-10-21.json
GET https://bycyb75.github.io/Importabolle/api/cache/bolla/1630/rese/mista/2026-10-21.json
```

La struttura della risposta (`success`, `disponibile`, `righe`,
`scaricato_at` o stato di attesa) resta compatibile. La data nel percorso è
`AAAA-MM-GG`; tipo è `arrivi` o `rese`; categoria è `quotidiani` o `mista`.
Per la cache completa:

```text
GET /Importabolle/data/cache.json
GET /Importabolle/api/cache/status.json
```

Per questo repository, l'indirizzo completo è:

```text
https://bycyb75.github.io/Importabolle/api/cache/bolla/1630/arrivi/quotidiani/2026-10-21.json
```

La pagina iniziale elenca i link alla cache e allo stato.

## Esecuzione manuale in locale

```powershell
npm install
copy .env.example .env
npm start
```

Inserisci le credenziali I2 in `.env`. Per fare un singolo ciclo senza
avviare il server:

```powershell
npm run scrape:once
```

La cache locale viene scritta in `data/cache.json`. Per rigenerare il sito
statico a partire dalla cache:

```powershell
npm run publish:static
```

## Dettagli

- Il workflow controlla oggi, domani e i giorni precedenti configurati con
  `GIORNI_INDIETRO` (default 14).
- Una bolla già scaricata con righe non viene richiesta di nuovo; per le
  combinazioni vuote o fallite si riprova fino a `MAX_TENTATIVI` (default 15).
- Quando non restano richieste in sospeso nella finestra, il job non effettua
  il login al portale; il job pianificato successivo rileva i dati del nuovo
  giorno quando la finestra cambia.
- La cache persistente viene recuperata e pubblicata nel branch `gh-pages`.
- Il server Express in `server.js` rimane disponibile per uso locale o per un
  host Node tradizionale; non è necessario per la pubblicazione GitHub Pages.
