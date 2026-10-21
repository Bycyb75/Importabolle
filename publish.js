'use strict';

const fs = require('fs');
const path = require('path');
const cache = require('./cache');
const { generaFinestraDate } = require('./scheduler');

const SITE_DIR = path.join(__dirname, 'site');
const BASE_PATH = String(process.env.PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
const TIPI = ['arrivi', 'rese'];
const CATEGORIE = ['quotidiani', 'mista'];

function writeJson(relativePath, value) {
  const outputPath = path.join(SITE_DIR, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(value, null, 2), 'utf8');
}

function formatResponse(voce) {
  if (!voce) {
    return { success: true, disponibile: false, stato: 'non_richiesta' };
  }
  if (!voce.disponibile) {
    const maxTentativi = parseInt(process.env.MAX_TENTATIVI || '15', 10);
    return {
      success: true,
      disponibile: false,
      stato: voce.tentativi >= maxTentativi ? 'esaurita' : 'in_attesa',
      tentativi: voce.tentativi,
      ultimo_tentativo: voce.ultimo_tentativo,
      errore: voce.errore,
    };
  }
  return {
    success: true,
    disponibile: true,
    righe: voce.righe,
    scaricato_at: voce.scaricato_at,
  };
}

async function main() {
  await cache.assicuraTabella();
  const voci = cache.tutteLeVoci();

  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SITE_DIR, '.nojekyll'), '', 'utf8');

  writeJson('data/cache.json', Object.fromEntries(
    voci.map((voce) => [
      `${voce.edicolaid}|${voce.tipo}|${voce.categoria}|${voce.data_bolla}`,
      voce,
    ])
  ));
  writeJson('api/cache/status.json', { success: true, voci });

  const vociPerChiave = new Map(
    voci.map((voce) => [
      `${voce.edicolaid}|${voce.tipo}|${voce.categoria}|${voce.data_bolla}`,
      voce,
    ])
  );
  const edicole = new Set(voci.map((voce) => String(voce.edicolaid)));
  edicole.add(String(process.env.I2_EDICOLAID || '1'));

  for (const edicolaid of edicole) {
    for (const { dataSQL } of generaFinestraDate()) {
      for (const tipo of TIPI) {
        for (const categoria of CATEGORIE) {
          const voce = vociPerChiave.get(`${edicolaid}|${tipo}|${categoria}|${dataSQL}`) || null;
          const route = path.join(
            'api',
            'cache',
            'bolla',
            edicolaid,
            tipo,
            categoria,
            `${dataSQL}.json`
          );
          writeJson(route, formatResponse(voce));
        }
      }
    }
  }

  for (const voce of voci) {
    if (!/^\d+$/.test(String(voce.edicolaid))) {
      throw new Error(`Codice edicola non valido nella cache: ${voce.edicolaid}`);
    }
    if (!['arrivi', 'rese'].includes(voce.tipo) || !['quotidiani', 'mista'].includes(voce.categoria)) {
      throw new Error(`Tipo o categoria non validi nella cache: ${voce.tipo}/${voce.categoria}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(voce.data_bolla)) {
      throw new Error(`Data non valida nella cache: ${voce.data_bolla}`);
    }

    const route = path.join(
      'api',
      'cache',
      'bolla',
      String(voce.edicolaid),
      voce.tipo,
      voce.categoria,
      `${voce.data_bolla}.json`
    );
    writeJson(route, formatResponse(voce));
  }

  const base = BASE_PATH;
  const index = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Importa Bolle</title></head>
<body><h1>Importa Bolle</h1>
  <p>Dati JSON delle bolle disponibili per i programmi collegati.</p>
<ul>
<li><a href="${base}/api/cache/status.json">Stato completo della cache (JSON)</a></li>
<li><a href="${base}/data/cache.json">Cache completa (JSON)</a></li>
</ul></body></html>`;
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), index, 'utf8');
  console.log(`Pubblicati ${voci.length} record statici in ${SITE_DIR}.`);
}

main().catch((err) => {
  console.error('[PUBLISH] ❌ Pubblicazione non riuscita:', err.message);
  process.exitCode = 1;
});
