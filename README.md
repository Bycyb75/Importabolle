# Importa Bolle Automatico

Servizio esterno che scarica automaticamente le bolle I2 (arrivi/rese, quotidiani/mista) ogni 20 minuti e le tiene in una cache propria, pronta per essere interrogata dal Gestionale Edicola quando li collegheremo.

## Come funziona

1. Ogni ciclo (default: 20 minuti) legge dalla tabella `utenti` (stesso database del gestionale) tutte le edicole con credenziali I2 configurate.
2. Per ciascuna, prova a scaricare: oggi, domani, e gli ultimi N giorni (default 14) per tutte le combinazioni arrivi/rese × quotidiani/mista non ancora scaricate con successo.
3. Salva il risultato nella propria tabella `i2_cache_bolle` (creata automaticamente), senza toccare le tabelle del gestionale.
4. Dopo un numero massimo di tentativi falliti/vuoti (default 15) smette di riprovare per quella combinazione specifica.

## API esposte

- `GET /health` — controllo di stato
- `GET /api/cache/bolla?edicolaid=&tipo=&categoria=&data=DD/MM/YYYY` — restituisce la bolla se già in cache
- `GET /api/cache/status` — elenco completo dello stato della cache (debug/monitoraggio)
- `POST /api/cache/forza-ciclo` — avvia subito un ciclo di scaricamento (senza attendere i 20 minuti)

## Test in locale

```powershell
npm install
copy .env.example .env   # poi modifica DATABASE_URL con quello del tuo Postgres
node server.js
```

## Deploy su Koyeb (piano gratuito, nessuna carta richiesta)

1. Il codice è già su GitHub: [Bycyb75/Importabolle](https://github.com/Bycyb75/Importabolle).
2. Vai su [app.koyeb.com](https://app.koyeb.com) → crea un account gratuito (bastano email o GitHub, nessuna carta richiesta per il piano Free).
3. **Create Service → GitHub**, seleziona il repository `Bycyb75/Importabolle`.
4. Builder: **Dockerfile** (rilevato automaticamente).
5. Istanza: scegli il piano **Free** (Nano).
6. Porta: imposta **8090** (deve combaciare con quella usata dal servizio).
7. Variabili d'ambiente:
   - `DATABASE_URL` → la "Internal/External Database URL" del Postgres del gestionale (se il DB è su Render, usa quella **esterna**, perché Koyeb non è nella stessa rete privata di Render)
   - `INTERVALLO_MINUTI` → `20`
   - `GIORNI_INDIETRO` → `14`
   - `MAX_TENTATIVI` → `15`
8. Deploy. Koyeb ti darà un URL pubblico tipo `https://importa-bolle-automatico-<tuonome>.koyeb.app`.

Il piano Free di Koyeb non richiede il trucco del "ping" per restare sveglio come Render: il servizio resta attivo di continuo. Se in futuro notassi comunque delle pause, si può comunque applicare la stessa soluzione descritta sotto per Render.

## Deploy su Render (alternativa, piano gratuito)

1. Crea un nuovo repository Git per questa cartella (o aggiungila come servizio separato in un repo esistente) e pusha su GitHub.
2. Su Render: **New → Blueprint**, collega il repository (userà `render.yaml` incluso, piano `free`, Docker con Chromium già pronto).
   - In alternativa, manuale: **New → Web Service**, Runtime **Docker**, piano **Free**.
3. Imposta la variabile d'ambiente **`DATABASE_URL`** → la stessa "Internal Database URL" del Postgres già usato dal gestionale su Render (le altre variabili hanno già un default in `render.yaml`).
4. Deploy. Il servizio parte in ascolto e avvia subito il primo ciclo, poi ogni 20 minuti.

### ⚠️ Limite del piano gratuito Render

Un Web Service gratuito Render si "addormenta" dopo 15 minuti senza traffico HTTP in arrivo, interrompendo anche lo scheduler interno. Per tenerlo sempre sveglio, registra l'URL pubblico (es. `https://importa-bolle-automatico.onrender.com/health`) su un servizio di ping gratuito che lo chiami ogni 10 minuti, ad esempio:
- [cron-job.org](https://cron-job.org) (gratuito, nessun limite stringente)
- [UptimeRobot](https://uptimerobot.com) (gratuito, intervallo minimo 5 minuti)

Senza questo accorgimento il servizio funziona comunque, ma si riattiva solo quando riceve una richiesta (es. quando il gestionale lo interroga), riprendendo da lì il ciclo di scaricamento.

## Prossimo passo

Collegare il Gestionale Edicola: il bottone "Importa Bolla I2" dovrà chiamare `GET /api/cache/bolla` su questo servizio (passandogli l'URL pubblico Render) invece di avviare direttamente lo scraping Playwright locale.
