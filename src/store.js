// Gestisce la memorizzazione storica dei dati scaricati (data/history.json)
'use strict';

const fs = require('fs');
const path = require('path');

// DATA_DIR è configurabile: in locale usa la cartella "data" del progetto,
// in cloud (Fly.io) punta al volume persistente montato (es. /data).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { runs: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch (err) {
    console.warn('Impossibile leggere lo storico esistente, ne verrà creato uno nuovo:', err.message);
    return { runs: [] };
  }
}

function saveHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Inserisce (o aggiorna se già presente) i dati del giorno nello storico.
 * @param {string} data Data in formato gg/mm/aaaa
 * @param {object} categorie Mappa { "A Quotidiani": {bolla, resa}, "C Mista": {bolla, resa} }
 */
function upsertRun(data, categorie) {
  const history = loadHistory();
  const timestamp = new Date().toISOString();
  const existingIndex = history.runs.findIndex((r) => r.data === data);
  const entry = { data, timestamp, categorie };

  if (existingIndex >= 0) {
    history.runs[existingIndex] = entry;
  } else {
    history.runs.push(entry);
  }

  // Ordina per data decrescente (gg/mm/aaaa -> aaaammgg per confronto)
  const toSortKey = (d) => d.data.split('/').reverse().join('');
  history.runs.sort((a, b) => (toSortKey(a) < toSortKey(b) ? 1 : -1));

  saveHistory(history);
  return history;
}

module.exports = { loadHistory, saveHistory, upsertRun, HISTORY_PATH, DATA_DIR };
