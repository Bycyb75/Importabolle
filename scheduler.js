const { apriSessione, scaricaConSessione } = require('./scraper');
const { parseTabellaBollaArrivi, parseTabellaBollaRese } = require('./utils/i2Parser');
const cache = require('./cache');

const GIORNI_INDIETRO = parseInt(process.env.GIORNI_INDIETRO || '14', 10);
const MAX_TENTATIVI = parseInt(process.env.MAX_TENTATIVI || '15', 10);
const TIPI = ['arrivi', 'rese'];
const CATEGORIE = ['quotidiani', 'mista'];

function generaFinestraDate(istante = new Date()) {
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(istante);
  const giornoOggi = Number(parti.find((parte) => parte.type === 'day').value);
  const meseOggi = Number(parti.find((parte) => parte.type === 'month').value);
  const annoOggi = Number(parti.find((parte) => parte.type === 'year').value);
  const oggi = new Date(Date.UTC(annoOggi, meseOggi - 1, giornoOggi));
  const date = [];
  // i = -1 → domani, poi oggi e via via indietro
  for (let i = -1; i <= GIORNI_INDIETRO; i++) {
    const d = new Date(oggi);
    d.setUTCDate(d.getUTCDate() - i);
    const giorno = String(d.getUTCDate()).padStart(2, '0');
    const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
    const anno = d.getUTCFullYear();
    date.push({
      dataI2: `${giorno}/${mese}/${anno}`,      // formato richiesto dal portale I2
      dataSQL: `${anno}-${mese}-${giorno}`      // formato usato come chiave nella cache
    });
  }
  return date;
}

// Credenziali I2 configurate via variabili d'ambiente (nessun database esterno necessario).
// Per più edicole in futuro: estendere leggendo una lista da env (es. JSON in I2_ACCOUNTS).
function getEdicole() {
  const username = process.env.I2_USERNAME;
  const password = process.env.I2_PASSWORD;
  if (!username || !password) {
    throw new Error('Configurare I2_USERNAME e I2_PASSWORD');
  }
  return [{
    edicolaid: process.env.I2_EDICOLAID || '1',
    username,
    password
  }];
}

async function elaboraEdicola(edicola) {
  const { edicolaid, username, password } = edicola;
  const finestra = generaFinestraDate();
  const daScaricare = [];

  for (const { dataI2, dataSQL } of finestra) {
    for (const categoria of CATEGORIE) {
      for (const tipo of TIPI) {
        const voce = await cache.getVoce(edicolaid, tipo, categoria, dataSQL);
        if (voce && voce.disponibile) continue;
        if (voce && voce.tentativi >= MAX_TENTATIVI) continue;
        daScaricare.push({ dataI2, dataSQL, categoria, tipo });
      }
    }
  }

  if (daScaricare.length === 0) {
    console.log(`[SCHEDULER] ✅ Edicola ${edicolaid}: nessuna bolla da scaricare, salto il login`);
    return;
  }

  console.log(`[SCHEDULER] 🔐 Edicola ${edicolaid}: login...`);
  let sessione;
  try {
    sessione = await apriSessione(username, password);
    console.log(`[SCHEDULER] ✅ Edicola ${edicolaid}: login riuscito`);
  } catch (err) {
    console.error(`[SCHEDULER] ❌ Edicola ${edicolaid}: login fallito: ${err.message}`);
    throw err;
  }

  try {
    for (const { dataI2, dataSQL, categoria, tipo } of daScaricare) {
      try {
        console.log(`[SCHEDULER] 📥 Edicola ${edicolaid}: ${tipo}/${categoria} del ${dataI2}...`);
        const html = await scaricaConSessione(sessione.page, tipo, categoria, dataI2);
        const righe = tipo === 'arrivi' ? parseTabellaBollaArrivi(html) : parseTabellaBollaRese(html);
        await cache.salvaSuccesso(edicolaid, tipo, categoria, dataSQL, righe);
        console.log(`[SCHEDULER] ✅ Edicola ${edicolaid}: ${tipo}/${categoria} del ${dataI2} → ${righe.length} righe`);
      } catch (err) {
        console.error(`[SCHEDULER] ⚠️ Edicola ${edicolaid}: ${tipo}/${categoria} del ${dataI2} fallito: ${err.message}`);
        await cache.salvaTentativoFallito(edicolaid, tipo, categoria, dataSQL, err.message);
      }
    }
  } finally {
    await sessione.browser.close();
  }
}

async function cicloCompleto() {
  console.log(`[SCHEDULER] 🔄 Avvio ciclo di scaricamento automatico - ${new Date().toISOString()}`);
  const edicole = getEdicole();
  console.log(`[SCHEDULER] 👤 ${edicole.length} edicole configurate`);
  for (const edicola of edicole) {
    await elaboraEdicola(edicola);
  }
  console.log(`[SCHEDULER] ✅ Ciclo completato - ${new Date().toISOString()}`);
}

function eseguiCicloConLogErrori() {
  cicloCompleto().catch((err) => {
    console.error('[SCHEDULER] ❌ Errore ciclo completo:', err.message);
  });
}

function avviaScheduler() {
  const intervalloMinuti = parseInt(process.env.INTERVALLO_MINUTI || '20', 10);
  eseguiCicloConLogErrori();
  setInterval(eseguiCicloConLogErrori, intervalloMinuti * 60 * 1000);
  console.log(`[SCHEDULER] ⏰ Pianificato ogni ${intervalloMinuti} minuti`);
}

module.exports = { avviaScheduler, cicloCompleto, generaFinestraDate };
