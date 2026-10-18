// Cache dedicata di questo servizio: nessun database esterno, solo un file JSON locale.
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
let store = {};

function chiave(edicolaid, tipo, categoria, dataBollaSQL) {
  return `${edicolaid}|${tipo}|${categoria}|${dataBollaSQL}`;
}

function salvaSuDisco() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2));
}

async function assicuraTabella() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      store = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[CACHE] ⚠️ Impossibile leggere il file di cache, riparto vuoto:', err.message);
    store = {};
  }
}

async function getVoce(edicolaid, tipo, categoria, dataBollaSQL) {
  return store[chiave(edicolaid, tipo, categoria, dataBollaSQL)] || null;
}

async function salvaSuccesso(edicolaid, tipo, categoria, dataBollaSQL, righe) {
  const k = chiave(edicolaid, tipo, categoria, dataBollaSQL);
  const precedente = store[k] || { tentativi: 0 };
  store[k] = {
    edicolaid, tipo, categoria, data_bolla: dataBollaSQL,
    disponibile: righe.length > 0,
    righe,
    tentativi: (precedente.tentativi || 0) + 1,
    ultimo_tentativo: new Date().toISOString(),
    scaricato_at: new Date().toISOString(),
    errore: null
  };
  salvaSuDisco();
}

async function salvaTentativoFallito(edicolaid, tipo, categoria, dataBollaSQL, messaggioErrore) {
  const k = chiave(edicolaid, tipo, categoria, dataBollaSQL);
  const precedente = store[k] || { tentativi: 0, disponibile: false, righe: null };
  store[k] = {
    ...precedente,
    edicolaid, tipo, categoria, data_bolla: dataBollaSQL,
    tentativi: (precedente.tentativi || 0) + 1,
    ultimo_tentativo: new Date().toISOString(),
    errore: messaggioErrore
  };
  salvaSuDisco();
}

function tutteLeVoci() {
  return Object.values(store).sort((a, b) => (a.data_bolla < b.data_bolla ? 1 : -1));
}

module.exports = { assicuraTabella, getVoce, salvaSuccesso, salvaTentativoFallito, tutteLeVoci };
