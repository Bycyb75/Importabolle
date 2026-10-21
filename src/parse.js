// Estrae i dati dalle pagine "Bolla" e "Resa" del portale MD online.
'use strict';

const cheerio = require('cheerio');

function parseEuro(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function parseInt10(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d-]/g, '');
  if (cleaned === '') return null;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

function textOf($, el) {
  return $(el).first().text().trim();
}

/** Estrae il titolo dell'intestazione, es. "Bolla 17/10/2026 A Sabato" */
function parseHeading($) {
  const heading = $('h1').first().text().replace(/\s+/g, ' ').trim();
  return heading;
}

/** Analizza una pagina Bolla.htm-<data>-<tipo> e restituisce le righe dei titoli */
function parseBolla(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('table#dlBolla table.tabella').each((_, recordTable) => {
    const $row = $(recordTable);
    const titolo = textOf($, $row.find('a[id$="hlDettaglio"]'));
    if (!titolo) return; // riga vuota/di servizio

    const contoDeposito = $row.find('input[name$="hfContoDeposito"]').attr('value') === 'True';

    items.push({
      titolo,
      codiceProdotto: ($row.find('a[id$="hlDettaglio"]').attr('href') || '').replace(/^\//, ''),
      codiceTestataFieg: textOf($, $row.find('[id$="lblNumero"]')),
      prezzoLordo: parseEuro(textOf($, $row.find('[id$="lblPrezzo"]'))),
      prezzoNetto: parseEuro(textOf($, $row.find('[id$="lblPrezzoNetto"]'))),
      copieFornite: parseInt10(textOf($, $row.find('[id$="lblCopie"]'))),
      differenza: textOf($, $row.find('[id$="lblDifferenza"]')) || null,
      mancanteEccedente: textOf($, $row.find('[id$="lblMancante"]')) || null,
      codiceTestataInterno: textOf($, $row.find('[id$="lblTestata"]')),
      tipoProdotto: textOf($, $row.find('td:last-child span[title]')) || null,
      contoDeposito,
      scadenzaContoDeposito: textOf($, $row.find('[id$="lblDataCd"]')) || null,
    });
  });

  const copieTotali = items.reduce((sum, i) => sum + (i.copieFornite || 0), 0);
  const valoreTotaleLordo = items.reduce(
    (sum, i) => sum + (i.prezzoLordo || 0) * (i.copieFornite || 0),
    0
  );
  const valoreTotaleNetto = items.reduce(
    (sum, i) => sum + (i.prezzoNetto || 0) * (i.copieFornite || 0),
    0
  );

  return {
    intestazione: parseHeading($),
    numeroTitoli: items.length,
    copieTotali,
    valoreTotaleLordo,
    valoreTotaleNetto,
    items,
  };
}

/** Analizza una pagina Resa.htm-<data>-<tipo>-<nome> e restituisce le righe dei titoli */
function parseResa(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('table#dlResa table.tabella').each((_, recordTable) => {
    const $row = $(recordTable);
    const titolo = textOf($, $row.find('a[id$="hlDettaglio"]'));
    if (!titolo) return;

    items.push({
      titolo,
      codiceProdotto: ($row.find('a[id$="hlDettaglio"]').attr('href') || '').replace(/^\//, ''),
      codiceTestataFieg: textOf($, $row.find('[id$="lblNumeroResa"]')),
      codiceTestataInterno: textOf($, $row.find('[id$="lblTestata"]')),
      dataUscita: textOf($, $row.find('[id$="lblDataUscita"]')) || null,
      prezzoLordo: parseEuro(textOf($, $row.find('[id$="lblPrezzo"]'))),
      prezzoNetto: parseEuro(textOf($, $row.find('[id$="lblPrezzoNetto"]'))),
      copieFornite: parseInt10(textOf($, $row.find('[id$="lblCopieDistribuito"]'))),
      copieDichiarateResa: parseInt10(textOf($, $row.find('[id$="lblDichiarato"]'))),
      copieRiscontrate: parseInt10(textOf($, $row.find('[id$="lblCopieRisc"]'))),
      differenza: textOf($, $row.find('[id$="lblDifferenza"]')) || null,
    });
  });

  const copieForniteTotali = items.reduce((sum, i) => sum + (i.copieFornite || 0), 0);
  const copieReseTotali = items.reduce((sum, i) => sum + (i.copieDichiarateResa || i.copieRiscontrate || 0), 0);
  const valoreResoNetto = items.reduce(
    (sum, i) => sum + (i.prezzoNetto || 0) * (i.copieDichiarateResa || i.copieRiscontrate || 0),
    0
  );

  return {
    intestazione: parseHeading($),
    numeroTitoli: items.length,
    copieForniteTotali,
    copieReseTotali,
    valoreResoNetto,
    items,
  };
}

module.exports = { parseBolla, parseResa };
