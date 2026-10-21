// Logica centrale di scraping: login, download Bolla/Resa per le categorie
// configurate, aggiornamento storico e report. Riutilizzata sia da index.js
// (esecuzione singola da riga di comando) sia da server.js (servizio web
// sempre attivo con scheduler interno).
'use strict';

const fs = require('fs');
const path = require('path');

const { createClient } = require('./mdClient');
const { parseBolla, parseResa } = require('./parse');
const { loadHistory, upsertRun, DATA_DIR } = require('./store');
const { generateReport } = require('./report');

const LOG_PATH = path.join(DATA_DIR, 'run.log');

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
  } catch (err) {
    console.warn('Impossibile scrivere sul file di log:', err.message);
  }
}

const CATEGORIE = [
  // "A Quotidiani" arriva tutti i giorni: una bolla scaricata con 0 titoli
  // significa che il sito non ha ancora pubblicato i dati -> va ritentato.
  { codice: 'A', nome: 'A Quotidiani', richiedeContenuto: true },
  // "C Mista" non viene consegnata ogni giorno: una bolla vuota ma scaricata
  // correttamente (nessun errore) è un esito finale legittimo per la giornata.
  { codice: 'C', nome: 'C Mista', richiedeContenuto: false },
];

function oggiGgMmAaaa() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

// Quanti giorni (oggi incluso) tenta di recuperare automaticamente lo
// scheduler ad ogni ciclo, per non perdere le bolle se il servizio resta
// fermo per qualche giorno. Configurabile con la variabile d'ambiente
// BACKFILL_GIORNI.
const BACKFILL_GIORNI = parseInt(process.env.BACKFILL_GIORNI || '14', 10);

/** Data (gg/mm/aaaa) corrispondente a "oggi meno `offset` giorni". */
function dataMenoGiorni(offset) {
  const [gg, mm, aaaa] = oggiGgMmAaaa().split('/').map(Number);
  // Ancorato a mezzanotte UTC: una volta noto il giorno di calendario di
  // "oggi" (calcolato in fuso Europe/Rome), la sottrazione di giorni interi
  // è pura aritmetica di calendario e non risente di fusi orari/ora legale.
  const d = new Date(Date.UTC(aaaa, mm - 1, gg));
  d.setUTCDate(d.getUTCDate() - offset);
  const gg2 = String(d.getUTCDate()).padStart(2, '0');
  const mm2 = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${gg2}/${mm2}/${d.getUTCFullYear()}`;
}

/**
 * Elenco delle date (gg/mm/aaaa) della finestra "oggi e i `giorni - 1` giorni
 * precedenti", ordinate dalla più vecchia alla più recente.
 */
function finestraDate(giorni = BACKFILL_GIORNI) {
  const date = [];
  for (let offset = giorni - 1; offset >= 0; offset--) {
    date.push(dataMenoGiorni(offset));
  }
  return date;
}

async function scaricaCategoria(client, data, categoria) {
  const risultato = { bolla: null, resa: null };

  try {
    const htmlBolla = await client.getHtml(`/Bolla.htm-${data}-${categoria.codice}`);
    risultato.bolla = parseBolla(htmlBolla);
  } catch (err) {
    log(`[${categoria.nome}] Bolla non disponibile per ${data}: ${err.message}`);
  }

  try {
    const htmlResa = await client.getHtml(
      `/Resa.htm-${data}-${categoria.codice}-${encodeURIComponent(categoria.nome)}`
    );
    risultato.resa = parseResa(htmlResa);
  } catch (err) {
    log(`[${categoria.nome}] Resa non disponibile per ${data}: ${err.message}`);
  }

  return risultato;
}

/**
 * Vero se per la categoria i dati sono da considerarsi definitivi per la giornata:
 * - se c'è stato un errore di rete/HTTP (bolla o resa = null), NON è completo -> si ritenta
 * - se la categoria richiede contenuto (es. A Quotidiani) ma la bolla è vuota,
 *   significa che il sito non ha ancora pubblicato i dati -> si ritenta
 * - altrimenti (fetch riuscito, con o senza titoli) è completo e non si ritenta più oggi
 */
function categoriaCompleta(categoria, dati) {
  if (!dati || dati.bolla === null || dati.resa === null) return false;
  if (categoria.richiedeContenuto && dati.bolla.numeroTitoli === 0) return false;
  return true;
}

/** Vero se tutte le categorie risultano definitive per la giornata (vedi categoriaCompleta). */
function categorieComplete(categorie) {
  return CATEGORIE.every((c) => categoriaCompleta(c, categorie[c.nome]));
}

/**
 * Esegue un ciclo di scraping: se i dati di oggi sono già definitivi non fa
 * nulla, altrimenti effettua login e scarica le categorie mancanti.
 * Restituisce un oggetto di stato utile per log/API.
 */
async function runScrapeCycle({ data: dataParam } = {}) {
  const baseUrl = process.env.MD_BASE_URL;
  const username = process.env.MD_USERNAME;
  const password = process.env.MD_PASSWORD;
  const data = dataParam || oggiGgMmAaaa();

  if (!baseUrl || !username || !password) {
    log('ERRORE: configurazione mancante: imposta MD_BASE_URL, MD_USERNAME, MD_PASSWORD.');
    return { ok: false, skipped: false, data, errore: 'configurazione mancante' };
  }

  const historyEsistente = loadHistory();
  const runEsistente = historyEsistente.runs.find((r) => r.data === data);
  if (runEsistente && categorieComplete(runEsistente.categorie)) {
    log(`Dati di ${data} già definitivi, nessuna nuova richiesta necessaria fino al cambio data.`);
    return { ok: true, skipped: true, data, completo: true };
  }

  try {
    log(`Login su ${baseUrl} come ${username}...`);
    const client = await createClient({ baseUrl, username, password });
    log('Login riuscito.');

    const categorie = {};
    for (const categoria of CATEGORIE) {
      log(`Scarico dati per ${categoria.nome} (${data})...`);
      categorie[categoria.nome] = await scaricaCategoria(client, data, categoria);
    }

    const history = upsertRun(data, categorie);
    const reportPath = generateReport(history, { edicolaNome: 'La Coccinella' });
    const completo = categorieComplete(categorie);

    if (completo) {
      log(`Dati definitivi per ${data}. Report aggiornato: ${reportPath}. Non verranno fatti nuovi tentativi fino al cambio data.`);
    } else {
      log(`Dati parziali per ${data} (bolla di A Quotidiani non ancora pubblicata). Report aggiornato: ${reportPath}. Verrà ritentato al prossimo ciclo.`);
    }

    return { ok: true, skipped: false, data, completo };
  } catch (err) {
    log('ERRORE durante lo scraping:', err.message);
    return { ok: false, skipped: false, data, errore: err.message };
  }
}

/**
 * Esegue un ciclo di scraping su una finestra di più giorni: di default
 * "oggi" e i `giorni - 1` giorni precedenti (vedi BACKFILL_GIORNI), per
 * recuperare automaticamente eventuali giorni non scaricati (es. dopo un
 * periodo in cui il servizio è rimasto fermo) oltre al dato odierno.
 *
 * Controlla prima, senza fare richieste di rete, quali date nella finestra
 * risultano già definitive nello storico (vedi categorieComplete): se sono
 * tutte complete non effettua nessun login. Altrimenti fa un solo login e
 * scarica in sequenza solo le date mancanti/incomplete.
 */
async function runScrapeWindow({ giorni = BACKFILL_GIORNI } = {}) {
  const baseUrl = process.env.MD_BASE_URL;
  const username = process.env.MD_USERNAME;
  const password = process.env.MD_PASSWORD;

  if (!baseUrl || !username || !password) {
    log('ERRORE: configurazione mancante: imposta MD_BASE_URL, MD_USERNAME, MD_PASSWORD.');
    return { ok: false, risultati: [], errore: 'configurazione mancante' };
  }

  const date = finestraDate(giorni);
  const historyEsistente = loadHistory();
  const dateDaScaricare = date.filter((data) => {
    const run = historyEsistente.runs.find((r) => r.data === data);
    return !(run && categorieComplete(run.categorie));
  });

  if (dateDaScaricare.length === 0) {
    log(
      `Dati già definitivi per tutti i ${giorni} giorni della finestra (${date[0]} - ${date[date.length - 1]}), nessuna richiesta necessaria.`
    );
    return { ok: true, risultati: [] };
  }

  log(`Giorni da scaricare/completare: ${dateDaScaricare.join(', ')}`);

  let client;
  try {
    log(`Login su ${baseUrl} come ${username}...`);
    client = await createClient({ baseUrl, username, password });
    log('Login riuscito.');
  } catch (err) {
    log('ERRORE durante il login:', err.message);
    return { ok: false, risultati: [], errore: err.message };
  }

  const risultati = [];
  let history = historyEsistente;
  for (const data of dateDaScaricare) {
    const categorie = {};
    for (const categoria of CATEGORIE) {
      log(`Scarico dati per ${categoria.nome} (${data})...`);
      categorie[categoria.nome] = await scaricaCategoria(client, data, categoria);
    }
    history = upsertRun(data, categorie);
    const completo = categorieComplete(categorie);
    log(
      completo
        ? `Dati definitivi per ${data}.`
        : `Dati parziali per ${data} (verrà ritentato al prossimo ciclo).`
    );
    risultati.push({ data, completo });
  }

  const reportPath = generateReport(history, { edicolaNome: 'La Coccinella' });
  log(`Report aggiornato: ${reportPath}.`);

  return { ok: true, risultati };
}

module.exports = {
  runScrapeCycle,
  runScrapeWindow,
  categorieComplete,
  oggiGgMmAaaa,
  dataMenoGiorni,
  finestraDate,
  BACKFILL_GIORNI,
  CATEGORIE,
  log,
};
