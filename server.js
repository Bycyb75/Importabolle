// Servizio web sempre attivo: espone i dati scaricati via API HTTP e gestisce
// internamente lo scheduling dello scraping (sostituisce l'Utilità di
// Pianificazione di Windows quando il progetto gira in cloud, es. Fly.io).
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const path = require('path');
const fs = require('fs');
const express = require('express');

const { runScrapeWindow, log, CATEGORIE } = require('./src/run');
const { loadHistory, DATA_DIR } = require('./src/store');
const { REPORT_PATH, renderPaginaDettaglioGiorno } = require('./src/report');
const { renderBollaPage, renderResaPage } = require('./src/i2Compat');

const PORT = process.env.PORT || 8080;
// Ogni quanti minuti ritentare lo scraping se i dati del giorno non sono ancora definitivi.
const RETRY_MINUTES = parseInt(process.env.RETRY_MINUTES || '20', 10);

const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ora: new Date().toISOString() });
});

// Dati completi dell'ultimo giorno scaricato (titoli, prezzi, date, copie, ecc.)
app.get('/api/latest', (req, res) => {
  const history = loadHistory();
  const ultimo = history.runs[0] || null;
  if (!ultimo) {
    return res.status(404).json({ errore: 'Nessun dato disponibile ancora.' });
  }
  res.json(ultimo);
});

// Storico completo di tutti i giorni scaricati finora.
app.get('/api/history', (req, res) => {
  res.json(loadHistory());
});

// Dati di una giornata specifica, formato gg-mm-aaaa nell'URL (es. /api/history/17-10-2026).
app.get('/api/history/:data', (req, res) => {
  const dataRichiesta = req.params.data.replace(/-/g, '/');
  const history = loadHistory();
  const run = history.runs.find((r) => r.data === dataRichiesta);
  if (!run) {
    return res.status(404).json({ errore: `Nessun dato trovato per ${dataRichiesta}.` });
  }
  res.json(run);
});

// Pagina HTML leggibile con gli stessi dati (comoda per controllo visivo da browser).
app.get('/report', (req, res) => {
  if (!fs.existsSync(REPORT_PATH)) {
    return res.status(404).send('Report non ancora generato.');
  }
  res.sendFile(REPORT_PATH);
});

// Dettaglio HTML (titoli, prezzi, copie) di un giorno specifico della finestra
// scaricata, formato gg-mm-aaaa nell'URL (es. /report/17-10-2026). Generata al
// volo dallo storico, non da un file statico, cosi' resta sempre aggiornata.
app.get('/report/:data', (req, res) => {
  const dataRichiesta = req.params.data.replace(/-/g, '/');
  const history = loadHistory();
  const run = history.runs.find((r) => r.data === dataRichiesta);
  if (!run) {
    return res.status(404).send(`Nessun dato trovato per ${dataRichiesta}.`);
  }
  res.type('html').send(renderPaginaDettaglioGiorno(run, { edicolaNome: 'La Coccinella' }));
});

// --- Compatibilità con il formato i2 (edicole.m-d.srl) ---
// Stesso schema di URL del portale reale, cosi' chi oggi fa scraping diretto
// di i2 (stessa struttura HTML: table#dlBolla/#dlResa, span lblNumero,
// lblPrezzo, lblPrezzoNetto, lblCopie, lblTestata, ecc.) puo' puntare qui
// cambiando solo l'indirizzo base, senza riscrivere il parser. Nessun login
// richiesto: i dati sono gia' tutti disponibili.

function trovaCategoria(tipo) {
  return CATEGORIE.find((c) => c.codice === tipo.toUpperCase());
}

// GET /Bolla.htm-17/10/2026-A  (A = Quotidiani, C = C Mista)
app.get(/^\/Bolla\.htm-(\d{2})\/(\d{2})\/(\d{4})-([AC])$/i, (req, res) => {
  const m = req.path.match(/^\/Bolla\.htm-(\d{2})\/(\d{2})\/(\d{4})-([AC])$/i);
  const [, gg, mm, aaaa, tipo] = m;
  const data = `${gg}/${mm}/${aaaa}`;
  const categoria = trovaCategoria(tipo);
  const history = loadHistory();
  const run = history.runs.find((r) => r.data === data);
  const bolla = run && categoria ? run.categorie[categoria.nome]?.bolla : null;
  res.type('html').send(renderBollaPage(bolla, { data, tipo: tipo.toUpperCase() }));
});

// GET /Resa.htm-17/10/2026-C-C%20Mista
app.get(/^\/Resa\.htm-(\d{2})\/(\d{2})\/(\d{4})-([AC])-(.+)$/i, (req, res) => {
  const m = req.path.match(/^\/Resa\.htm-(\d{2})\/(\d{2})\/(\d{4})-([AC])-(.+)$/i);
  const [, gg, mm, aaaa, tipo] = m;
  const data = `${gg}/${mm}/${aaaa}`;
  const categoria = trovaCategoria(tipo);
  const history = loadHistory();
  const run = history.runs.find((r) => r.data === data);
  const resa = run && categoria ? run.categorie[categoria.nome]?.resa : null;
  res.type('html').send(renderResaPage(resa, { data, tipo: tipo.toUpperCase() }));
});

// Stub di compatibilità per chi riusa ancora il flusso di login del sito
// originale: qui non serve autenticarsi, risponde sempre "successo".
app.get('/Login.htm', (req, res) => {
  res.type('html').send('<html><body>Login non necessario su questo servizio.</body></html>');
});
app.post('/Account/Login.aspx/LogMeIn', express.json(), (req, res) => {
  res.json({ d: '"EdicolaOK"' });
});

app.get('/', (req, res) => {
  res.redirect('/report');
});

app.listen(PORT, '0.0.0.0', () => {
  log(`Server avviato su porta ${PORT}. Cartella dati: ${DATA_DIR}`);
});

// Esegue subito un ciclo di scraping all'avvio, poi ripete ogni RETRY_MINUTES.
// Ogni ciclo copre una finestra di più giorni (oggi + BACKFILL_GIORNI - 1
// giorni precedenti, vedi src/run.js) in modo da recuperare automaticamente
// eventuali giorni non scaricati (es. servizio fermo per qualche giorno),
// oltre a ritentare il dato odierno finché non risulta definitivo.
async function cicloSchedulato() {
  try {
    await runScrapeWindow();
  } catch (err) {
    log('ERRORE imprevisto nel ciclo di scraping:', err.message);
  }
}

cicloSchedulato();
setInterval(cicloSchedulato, RETRY_MINUTES * 60 * 1000);
