// Genera i file statici che mantengono disponibili report e API su GitHub Pages.
'use strict';

const fs = require('fs');
const path = require('path');

const { loadHistory, DATA_DIR } = require('./store');
const { generateReport, renderPaginaDettaglioGiorno, dataPerUrl } = require('./report');
const { renderBollaPage, renderResaPage } = require('./i2Compat');
const { CATEGORIE } = require('./run');

const SITE_DIR = path.join(__dirname, '..', 'site');
const BASE_PATH = String(process.env.PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

function writeFile(relativePath, contents) {
  const outputPath = path.join(SITE_DIR, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, contents, 'utf8');
}

function writeJson(relativePath, value) {
  writeFile(relativePath, JSON.stringify(value, null, 2));
}

function writeRoute(route, html) {
  const relativePath = decodeURIComponent(route.replace(/^\/+/, ''));
  writeFile(relativePath, html);
}

function publishStaticSite() {
  const history = loadHistory();
  const runs = history.runs || [];

  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });
  writeFile('.nojekyll', '');
  writeJson('health', { status: 'ok' });
  writeJson(path.join('api', 'history', 'index.html'), history);
  writeJson('api/latest', runs[0] || { errore: 'Nessun dato disponibile ancora.' });
  writeJson('data/history.json', history);

  const reportPath = path.join(SITE_DIR, 'report', 'index.html');
  generateReport(history, {
    edicolaNome: 'La Coccinella',
    outputPath: reportPath,
    basePath: BASE_PATH,
  });

  writeFile(
    'index.html',
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${BASE_PATH}/report/"><title>Bolle e Rese</title></head><body><a href="${BASE_PATH}/report/">Apri il report</a></body></html>`
  );

  for (const run of runs) {
    const dataUrl = dataPerUrl(run.data);
    writeJson(path.join('api', 'history', dataUrl), run);
    const detailPath = path.join('report', dataUrl, 'index.html');
    writeFile(
      detailPath,
      renderPaginaDettaglioGiorno(run, {
        edicolaNome: 'La Coccinella',
        basePath: BASE_PATH,
      })
    );

    for (const categoria of CATEGORIE) {
      const dati = run.categorie?.[categoria.nome];
      writeRoute(
        `/Bolla.htm-${run.data}-${categoria.codice}`,
        renderBollaPage(dati?.bolla || null, { data: run.data, tipo: categoria.codice })
      );
      writeRoute(
        `/Resa.htm-${run.data}-${categoria.codice}-${encodeURIComponent(categoria.nome)}`,
        renderResaPage(dati?.resa || null, { data: run.data, tipo: categoria.codice })
      );
    }
  }

  console.log(`Sito statico generato in ${SITE_DIR} usando lo storico ${HISTORY_PATH}.`);
}

publishStaticSite();
