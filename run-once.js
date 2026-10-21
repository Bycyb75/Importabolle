'use strict';

require('dotenv').config();

const cache = require('./cache');
const { cicloCompleto } = require('./scheduler');

async function main() {
  for (const nome of ['I2_USERNAME', 'I2_PASSWORD', 'I2_EDICOLAID']) {
    if (!process.env[nome]) {
      throw new Error(`Configurare il secret ${nome}`);
    }
  }
  if (!/^\d+$/.test(process.env.I2_EDICOLAID)) {
    throw new Error('I2_EDICOLAID deve contenere solo cifre');
  }

  await cache.assicuraTabella();
  await cicloCompleto();
}

main().catch((err) => {
  console.error('[SCRAPER] ❌ Esecuzione non riuscita:', err.message);
  process.exitCode = 1;
});
