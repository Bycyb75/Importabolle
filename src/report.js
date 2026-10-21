// Genera la pagina HTML locale con i dati di bolle e rese.
'use strict';

const fs = require('fs');
const path = require('path');

// In locale scrive report.html nella root del progetto; in cloud (Fly.io)
// lo scrive nel volume persistente, cosi' resta disponibile dopo un riavvio.
const REPORT_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'report.html')
  : path.join(__dirname, '..', 'report.html');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function euro(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function renderBollaTable(bolla) {
  if (!bolla || !bolla.items.length) {
    return '<p class="muted">Nessun dato di bolla disponibile.</p>';
  }
  const rows = bolla.items
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.titolo)}</td>
        <td>${escapeHtml(i.codiceTestataFieg)}</td>
        <td class="num">${escapeHtml(i.copieFornite)}</td>
        <td class="num">${euro(i.prezzoLordo)}</td>
        <td class="num">${euro(i.prezzoNetto)}</td>
        <td>${i.contoDeposito ? 'CD' + (i.scadenzaContoDeposito ? ' (' + escapeHtml(i.scadenzaContoDeposito) + ')' : '') : '-'}</td>
        <td>${escapeHtml(i.codiceTestataInterno) || '-'}</td>
        <td>${escapeHtml(i.mancanteEccedente || i.differenza || '-')}</td>
      </tr>`
    )
    .join('');

  return `
    <table class="data">
      <thead>
        <tr><th>Titolo</th><th>Cod. Fieg</th><th>Copie fornite</th><th>Prezzo lordo</th><th>Prezzo netto</th><th>Cd</th><th>Testata</th><th>Mancanze/Eccedenze</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Totale (${bolla.numeroTitoli} titoli)</strong></td>
          <td class="num"><strong>${bolla.copieTotali}</strong></td>
          <td class="num"><strong>${euro(bolla.valoreTotaleLordo)}</strong></td>
          <td class="num"><strong>${euro(bolla.valoreTotaleNetto)}</strong></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

function renderResaTable(resa) {
  if (!resa || !resa.items.length) {
    return '<p class="muted">Nessun dato di resa disponibile.</p>';
  }
  const rows = resa.items
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.titolo)}</td>
        <td>${escapeHtml(i.codiceTestataFieg)}</td>
        <td class="num">${escapeHtml(i.copieFornite)}</td>
        <td class="num">${escapeHtml(i.copieDichiarateResa ?? i.copieRiscontrate)}</td>
        <td class="num">${euro(i.prezzoNetto)}</td>
        <td>${escapeHtml(i.codiceTestataInterno) || '-'}</td>
        <td class="num">${escapeHtml(i.differenza)}</td>
      </tr>`
    )
    .join('');

  return `
    <table class="data">
      <thead>
        <tr><th>Titolo</th><th>Cod. Fieg</th><th>Fornito</th><th>Reso (dichiarato)</th><th>Prezzo netto</th><th>Testata</th><th>Diff.</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Totale (${resa.numeroTitoli} titoli)</strong></td>
          <td class="num"><strong>${resa.copieForniteTotali}</strong></td>
          <td class="num"><strong>${resa.copieReseTotali}</strong></td>
          <td class="num"><strong>${euro(resa.valoreResoNetto)}</strong></td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

function renderCategoria(nome, dati) {
  return `
    <section class="categoria">
      <h3>${escapeHtml(nome)}</h3>
      <h4>Bolla</h4>
      ${renderBollaTable(dati.bolla)}
      <h4>Resa</h4>
      ${renderResaTable(dati.resa)}
    </section>`;
}

/** Converte "gg/mm/aaaa" nel formato "gg-mm-aaaa" usato nelle URL (es. /report/<data>, /api/history/<data>). */
function dataPerUrl(data) {
  return data.replace(/\//g, '-');
}

function renderStoricoRiga(run, basePath) {
  const totFornite = Object.values(run.categorie).reduce(
    (s, c) => s + (c.bolla ? c.bolla.copieTotali : 0),
    0
  );
  const totRese = Object.values(run.categorie).reduce(
    (s, c) => s + (c.resa ? c.resa.copieReseTotali : 0),
    0
  );
  const valoreNetto = Object.values(run.categorie).reduce(
    (s, c) => s + (c.bolla ? c.bolla.valoreTotaleNetto : 0),
    0
  );
  const link = `<a href="${escapeHtml(`${basePath}/report/${dataPerUrl(run.data)}`)}">${escapeHtml(run.data)}</a>`;
  return `<tr><td>${link}</td><td class="num">${totFornite}</td><td class="num">${totRese}</td><td class="num">${euro(valoreNetto)}</td></tr>`;
}

const STILE_CSS = `
  body { font-family: Segoe UI, Arial, sans-serif; margin: 2rem; background: #f5f6f8; color: #222; }
  h1 { margin-bottom: 0.2rem; }
  .sub { color: #666; margin-top: 0; margin-bottom: 1.5rem; }
  section.categoria { background: #fff; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  table.data { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.92rem; }
  table.data th, table.data td { border-bottom: 1px solid #e0e0e0; padding: 0.4rem 0.6rem; text-align: left; }
  table.data thead th { background: #eef1f5; }
  table.data td.num, table.data th.num { text-align: right; }
  .num { text-align: right; }
  table.data tfoot td { border-top: 2px solid #ccc; border-bottom: none; }
  .muted { color: #888; font-style: italic; }
  h3 { margin-top: 1.2rem; margin-bottom: 0.3rem; color: #1a4d8f; }
  h4 { margin-bottom: 0.3rem; margin-top: 1rem; }
  table.storico { border-collapse: collapse; width: 100%; max-width: 600px; }
  table.storico th, table.storico td { border: 1px solid #ddd; padding: 0.3rem 0.6rem; }
  table.storico th { background: #eef1f5; }
  table.storico td a { color: #1a4d8f; text-decoration: none; }
  table.storico td a:hover { text-decoration: underline; }
  .torna { display: inline-block; margin-bottom: 1rem; color: #1a4d8f; }
  footer { margin-top: 2rem; color: #999; font-size: 0.8rem; }`;

/** Pagina HTML completa (head/body comuni) attorno a un blocco di contenuto già pronto. */
function renderPagina({ titolo, corpo }) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(titolo)}</title>
<style>${STILE_CSS}</style>
</head>
<body>
${corpo}
<footer>Generato automaticamente da md-scraper.</footer>
</body>
</html>`;
}

function generateReport(history, { edicolaNome, outputPath = REPORT_PATH, basePath = '' } = {}) {
  const normalizedBasePath = String(basePath).replace(/\/+$/, '');
  const runs = history.runs || [];
  const ultimo = runs[0];

  const categorieHtml = ultimo
    ? Object.entries(ultimo.categorie)
        .map(([nome, dati]) => renderCategoria(nome, dati))
        .join('')
    : '<p class="muted">Nessun dato ancora scaricato.</p>';

  const storicoRows = runs.map((run) => renderStoricoRiga(run, normalizedBasePath)).join('');

  const corpo = `
  <h1>Bolle e Rese${edicolaNome ? ' — ' + escapeHtml(edicolaNome) : ''}</h1>
  <p class="sub">Ultimo aggiornamento: ${ultimo ? escapeHtml(ultimo.data) : '-'} (scaricato il ${
    ultimo ? new Date(ultimo.timestamp).toLocaleString('it-IT') : '-'
  })</p>

  ${categorieHtml}

  <section class="categoria">
    <h3>Storico</h3>
    <p class="muted">Clicca su una data per vedere il dettaglio completo (titoli, prezzi, copie) di quel giorno.</p>
    <table class="storico">
      <thead><tr><th>Data</th><th>Copie fornite</th><th>Copie rese</th><th>Valore netto bolla</th></tr></thead>
      <tbody>${storicoRows}</tbody>
    </table>
  </section>`;

  const html = renderPagina({ titolo: `Bolle e Rese ${edicolaNome || ''}`, corpo });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

/**
 * Pagina HTML di dettaglio per un singolo giorno già presente nello storico
 * (stesso stile/struttura di generateReport, ma per una data specifica invece
 * che per l'ultimo giorno). Generata al volo da server.js, non scritta su disco.
 */
function renderPaginaDettaglioGiorno(run, { edicolaNome, basePath = '' } = {}) {
  const categorieHtml = run
    ? Object.entries(run.categorie)
        .map(([nome, dati]) => renderCategoria(nome, dati))
        .join('')
    : '<p class="muted">Nessun dato disponibile per questa data.</p>';

  const corpo = `
  <a class="torna" href="${escapeHtml(`${String(basePath).replace(/\/+$/, '')}/report`)}">&larr; Torna allo storico completo</a>
  <h1>Bolle e Rese${edicolaNome ? ' — ' + escapeHtml(edicolaNome) : ''}</h1>
  <p class="sub">Dettaglio del ${run ? escapeHtml(run.data) : '-'}${
    run ? ` (scaricato il ${new Date(run.timestamp).toLocaleString('it-IT')})` : ''
  }</p>

  ${categorieHtml}`;

  return renderPagina({ titolo: `Bolle e Rese ${run ? run.data : ''} ${edicolaNome || ''}`, corpo });
}

module.exports = { generateReport, renderPaginaDettaglioGiorno, dataPerUrl, REPORT_PATH };
