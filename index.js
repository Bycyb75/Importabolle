// Punto di ingresso per l'esecuzione manuale da riga di comando (una tantum).
// Per l'esecuzione continua come servizio (locale o su Fly.io) vedi server.js.
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { runScrapeCycle, runScrapeWindow } = require('./src/run');

const data = process.argv[2]; // opzionale: gg/mm/aaaa

// Senza data specifica: scarica/completa l'intera finestra (oggi + i giorni
// precedenti, vedi BACKFILL_GIORNI in src/run.js), per recuperare anche i
// giorni non ancora salvati nello storico. Con una data specifica: comportamento
// precedente, utile per forzare/testare un singolo giorno puntuale.
const promessa = data ? runScrapeCycle({ data }) : runScrapeWindow();

promessa.then((risultato) => {
  process.exit(risultato.ok ? 0 : 1);
});
