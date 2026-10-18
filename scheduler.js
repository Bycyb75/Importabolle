const pool = require('./db');
const { decripta } = require('./crypto');
const { scaricaDocumento } = require('./scraper');
const { parseTabellaBollaArrivi, parseTabellaBollaRese } = require('./utils/i2Parser');
const cache = require('./cache');

const GIORNI_INDIETRO = parseInt(process.env.GIORNI_INDIETRO || '14', 10);
const MAX_TENTATIVI = parseInt(process.env.MAX_TENTATIVI || '15', 10);
const TIPI = ['arrivi', 'rese'];
const CATEGORIE = ['quotidiani', 'mista'];

function generaFinestraDate() {
  const oggi = new Date();
  const date = [];
  // i = -1 → domani, poi oggi e via via indietro
  for (let i = -1; i <= GIORNI_INDIETRO; i++) {
    const d = new Date(oggi);
    d.setDate(d.getDate() - i);
    const giorno = String(d.getDate()).padStart(2, '0');
    const mese = String(d.getMonth() + 1).padStart(2, '0');
    const anno = d.getFullYear();
    date.push({
      dataI2: `${giorno}/${mese}/${anno}`,      // formato richiesto dal portale I2
      dataSQL: `${anno}-${mese}-${giorno}`      // formato per la cache Postgres
    });
  }
  return date;
}

async function getUtentiConCredenzialiI2() {
  const res = await pool.query(`
    SELECT id_utente, username, edicolaid, username_i2, password_i2
    FROM utenti
    WHERE edicolaid IS NOT NULL AND username_i2 IS NOT NULL AND password_i2 IS NOT NULL
  `);
  return res.rows;
}

async function elaboraUtente(utente) {
  const { edicolaid, username } = utente;
  let usernameI2, passwordI2;
  try {
    usernameI2 = decripta(utente.username_i2);
    passwordI2 = decripta(utente.password_i2);
  } catch (err) {
    console.error(`[SCHEDULER] ❌ Credenziali I2 non decifrabili per ${username} (edicolaid ${edicolaid}): ${err.message}`);
    return;
  }

  const finestra = generaFinestraDate();

  for (const { dataI2, dataSQL } of finestra) {
    for (const categoria of CATEGORIE) {
      for (const tipo of TIPI) {
        const voce = await cache.getVoce(edicolaid, tipo, categoria, dataSQL);

        if (voce && voce.disponibile) continue; // già scaricata con successo
        if (voce && voce.tentativi >= MAX_TENTATIVI) continue; // smesso di riprovare

        try {
          console.log(`[SCHEDULER] 📥 Edicola ${edicolaid}: ${tipo}/${categoria} del ${dataI2}...`);
          const html = await scaricaDocumento(usernameI2, passwordI2, tipo, categoria, dataI2);
          const righe = tipo === 'arrivi' ? parseTabellaBollaArrivi(html) : parseTabellaBollaRese(html);
          await cache.salvaSuccesso(edicolaid, tipo, categoria, dataSQL, righe);
          console.log(`[SCHEDULER] ✅ Edicola ${edicolaid}: ${tipo}/${categoria} del ${dataI2} → ${righe.length} righe`);
        } catch (err) {
          console.error(`[SCHEDULER] ⚠️ Edicola ${edicolaid}: ${tipo}/${categoria} del ${dataI2} fallito: ${err.message}`);
          await cache.salvaTentativoFallito(edicolaid, tipo, categoria, dataSQL, err.message);
        }
      }
    }
  }
}

async function cicloCompleto() {
  console.log(`[SCHEDULER] 🔄 Avvio ciclo di scaricamento automatico - ${new Date().toISOString()}`);
  try {
    const utenti = await getUtentiConCredenzialiI2();
    console.log(`[SCHEDULER] 👤 ${utenti.length} edicole con credenziali I2 configurate`);
    for (const utente of utenti) {
      await elaboraUtente(utente);
    }
  } catch (err) {
    console.error('[SCHEDULER] ❌ Errore ciclo completo:', err.message);
  }
  console.log(`[SCHEDULER] ✅ Ciclo completato - ${new Date().toISOString()}`);
}

function avviaScheduler() {
  const intervalloMinuti = parseInt(process.env.INTERVALLO_MINUTI || '20', 10);
  cicloCompleto(); // esegue subito al primo avvio
  setInterval(cicloCompleto, intervalloMinuti * 60 * 1000);
  console.log(`[SCHEDULER] ⏰ Pianificato ogni ${intervalloMinuti} minuti`);
}

module.exports = { avviaScheduler, cicloCompleto };
