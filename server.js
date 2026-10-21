require('dotenv').config();
const express = require('express');
const cache = require('./cache');
const { avviaScheduler, cicloCompleto } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 8090;

app.get('/health', (req, res) => res.json({ ok: true }));

// Restituisce la bolla dalla cache, se già scaricata
app.get('/api/cache/bolla', async (req, res) => {
  const { edicolaid, tipo, categoria, data } = req.query; // data in formato DD/MM/YYYY
  if (!edicolaid || !tipo || !categoria || !data) {
    return res.status(400).json({ success: false, message: 'Parametri mancanti (edicolaid, tipo, categoria, data)' });
  }
  const dataSQL = data.split('/').reverse().join('-');
  const voce = await cache.getVoce(parseInt(edicolaid, 10), tipo, categoria, dataSQL);

  if (!voce) {
    return res.json({ success: true, disponibile: false, stato: 'non_richiesta' });
  }
  if (!voce.disponibile) {
    return res.json({
      success: true,
      disponibile: false,
      stato: voce.tentativi >= parseInt(process.env.MAX_TENTATIVI || '15', 10) ? 'esaurita' : 'in_attesa',
      tentativi: voce.tentativi,
      ultimo_tentativo: voce.ultimo_tentativo,
      errore: voce.errore
    });
  }
  return res.json({
    success: true,
    disponibile: true,
    righe: voce.righe,
    scaricato_at: voce.scaricato_at
  });
});

// Elenco di stato per monitoraggio/debug
app.get('/api/cache/status', async (req, res) => {
  res.json({ success: true, voci: cache.tutteLeVoci() });
});

// Forza un ciclo di scaricamento immediato (utile per test/debug)
app.post('/api/cache/forza-ciclo', async (req, res) => {
  cicloCompleto().catch((err) => {
    console.error('[SERVER] ❌ Errore nel ciclo forzato:', err.message);
  });
  res.json({ success: true, message: 'Ciclo avviato in background' });
});

async function main() {
  await cache.assicuraTabella();
  app.listen(PORT, () => {
    console.log(`[SERVER] 🚀 Importa Bolle Automatico in ascolto sulla porta ${PORT}`);
    avviaScheduler();
  });
}

main();
