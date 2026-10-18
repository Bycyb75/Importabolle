# Importa Bolle Automatico

Servizio esterno che scarica automaticamente le bolle I2 (arrivi/rese, quotidiani/mista) ogni 20 minuti e le tiene in una cache propria, pronta per essere interrogata dal Gestionale Edicola quando li collegheremo.

Nessuna dipendenza da Render: le credenziali I2 si impostano come variabili d'ambiente e i dati scaricati si salvano in un file locale (`data/cache.json`).

## Come funziona

1. Ogni ciclo (default: 20 minuti) usa le credenziali I2 configurate tramite variabili d'ambiente (`I2_USERNAME`, `I2_PASSWORD`, `I2_EDICOLAID`).
2. Prova a scaricare: oggi, domani, e gli ultimi N giorni (default 14) per tutte le combinazioni arrivi/rese × quotidiani/mista non ancora scaricate con successo.
3. Salva il risultato in un file locale (`data/cache.json`, creato automaticamente).
4. Dopo un numero massimo di tentativi falliti/vuoti (default 15) smette di riprovare per quella combinazione specifica.

## API esposte

- `GET /health` — controllo di stato
- `GET /api/cache/bolla?edicolaid=&tipo=&categoria=&data=DD/MM/YYYY` — restituisce la bolla se già in cache
- `GET /api/cache/status` — elenco completo dello stato della cache (debug/monitoraggio)
- `POST /api/cache/forza-ciclo` — avvia subito un ciclo di scaricamento (senza attendere i 20 minuti)

## Test in locale

```powershell
npm install
copy .env.example .env   # poi modifica I2_USERNAME / I2_PASSWORD con le tue credenziali I2
node server.js
```

## Deploy su Northflank (piano gratuito, consigliato, nessuna carta richiesta)

1. Il codice è già su GitHub: [Bycyb75/Importabolle](https://github.com/Bycyb75/Importabolle).
2. Vai su [northflank.com](https://northflank.com) → registrati gratis (anche con account GitHub, nessuna carta richiesta per il piano Free).
3. Crea un nuovo **Project** (un contenitore per i tuoi servizi).
4. Dentro il progetto: **Create new → Service → Deployment**.
5. **Connect a repository** → autorizza GitHub → scegli `Bycyb75/Importabolle`, branch `main`.
6. Build: **Dockerfile** (rilevato automaticamente, niente da cambiare).
7. Piano/risorse: scegli il piano **Free**.
8. **Networking**: porta **8090**, protocollo **HTTP**, accessibilità **Public**.
9. **Environment variables**:
   - `I2_USERNAME` → il tuo username del portale I2 (es. `427.lacoccinella`)
   - `I2_PASSWORD` → la tua password I2
   - `I2_EDICOLAID` → `1630` (o il tuo codice edicola)
   - `INTERVALLO_MINUTI` → `20`
   - `GIORNI_INDIETRO` → `14`
   - `MAX_TENTATIVI` → `15`
10. **Deploy**. Northflank ti darà un URL pubblico tipo `https://importa-bolle-automatico--xxxxx.code.run`.

> ⚠️ Il file `data/cache.json` vive sul disco del container: su alcuni piani gratuiti può non sopravvivere a un redeploy. Non è un problema grave: al riavvio lo scheduler ricomincia semplicemente a riscaricare le bolle mancanti.

## Prossimo passo

Collegare il Gestionale Edicola: il bottone "Importa Bolla I2" dovrà chiamare `GET /api/cache/bolla` su questo servizio (passandogli l'URL pubblico) invece di avviare direttamente lo scraping Playwright locale.

