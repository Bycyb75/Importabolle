// Rigenera pagine HTML strutturalmente compatibili con quelle originali del
// portale i2 (edicole.m-d.srl), a partire dai dati già scaricati e salvati
// (data/history.json). Serve per permettere ad altri progetti che già sanno
// "leggere" l'HTML di i2 (stessi id di tabelle/span) di puntare a questo
// servizio al posto del portale reale, senza dover riscrivere il parser.
//
// Riferimento struttura reale osservata su i2:
// - Bolla: table#dlBolla > tbody > tr > td > table#record > tbody > tr
//     con a[id$="hlDettaglio"], span#lblPrezzo, span[id$="lblPrezzoNetto"],
//     span[id$="lblNumero"], span[id$="lblCopie"], input#txtVerificato,
//     span[id$="lblTestata"], span[id$="lblDifferenza"]/[id$="lblMancante"],
//     img#imgCd + span#lblDataCd (solo se c'è conto deposito).
// - Resa: table#dlResa, stessa logica ma span[id$="lblNumeroResa"] (+ data
//     uscita su una riga successiva), span[id$="lblCopieDistribuito"]
//     (= "Fornito"), span[id$="lblDichiarato"] (= resa dichiarata).
'use strict';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEuro(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' €';
}

/** Genera il blocco <table id="dlBolla"> con una riga per ogni titolo. */
function renderDlBolla(items) {
  const righe = items
    .map((item, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      const prefix = `ctl00_MainContent_dlBolla_ctl${n}`;
      const cdHtml = item.contoDeposito
        ? `<img id="imgCd" title="${escapeHtml(item.scadenzaContoDeposito || '')}" alt="Conto deposito" />
           <br />
           <span id="lblDataCd">${escapeHtml(item.scadenzaContoDeposito || '')}</span>`
        : '';
      return `
      <tr><td>
        <table id="record" class="tabella">
          <tbody><tr>
            <td><strong><a id="${prefix}_hlDettaglio" href="/${escapeHtml(item.codiceProdotto || '')}">${escapeHtml(item.titolo)}</a></strong></td>
            <td></td>
            <td></td>
            <td><span id="${prefix}_lblNumero">${escapeHtml(item.codiceTestataFieg)}</span></td>
            <td style="text-align:center">
              <span id="lblPrezzo">${formatEuro(item.prezzoLordo)}</span>
              <br />
              <span id="${prefix}_lblPrezzoNetto" title="${formatEuro(item.prezzoNetto)}">${formatEuro(item.prezzoNetto)}</span>
            </td>
            <td style="text-align:center">${cdHtml}</td>
            <td style="text-align:center">
              <span id="${prefix}_lblCopie">${item.copieFornite ?? 0}</span>
              <input name="ctl00$MainContent$dlBolla$ctl${n}$txtVerificato" type="text" value="${item.copieFornite ?? 0}" maxlength="4" id="txtVerificato" class=" textEntryBolla" />
            </td>
            <td style="text-align:center">
              <span id="${prefix}_lblDifferenza" style="font-weight: 700;">${escapeHtml(item.differenza || '-')}</span>
              <span id="${prefix}_lblMancante" title="Quantità segnalata">${escapeHtml(item.mancanteEccedente || '')}</span>
            </td>
            <td></td>
            <td style="text-align:center"><span id="${prefix}_lblTestata">${escapeHtml(item.codiceTestataInterno)}</span></td>
            <td style="text-align:center"><span title="Prodotto editoriale">${escapeHtml(item.tipoProdotto || 'PE')}</span></td>
          </tr></tbody>
        </table>
      </td></tr>`;
    })
    .join('\n');

  return `<table id="dlBolla" cellspacing="0"><tbody>${righe}</tbody></table>`;
}

/** Genera il blocco <table id="dlResa"> con una riga per ogni titolo. */
function renderDlResa(items) {
  const righe = items
    .map((item, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      const prefix = `ctl00_MainContent_dlResa_ctl${n}`;
      const dichiarato = item.copieDichiarateResa ?? item.copieRiscontrate;
      return `
      <tr><td>
        <table id="record" class="tabella">
          <tbody><tr>
            <td><strong><a id="${prefix}_hlDettaglio" class="linkPub" href="/${escapeHtml(item.codiceProdotto || '')}">${escapeHtml(item.titolo)}</a></strong></td>
            <td>
              <span id="${prefix}_lblNumeroResa">${escapeHtml(item.codiceTestataFieg)}</span>
              <br />
              <span id="${prefix}_lblDataUscita" title="Data di uscita">${escapeHtml(item.dataUscita || '')}</span>
            </td>
            <td style="text-align:center">
              <span id="lblPrezzo">${formatEuro(item.prezzoLordo)}</span>
              <br />
              <span id="${prefix}_lblPrezzoNetto" title="${formatEuro(item.prezzoNetto)}">${formatEuro(item.prezzoNetto)}</span>
            </td>
            <td class="distr" style="text-align:center">
              <span id="${prefix}_lblCopieDistribuito">${item.copieFornite ?? 0}</span>
            </td>
            <td style="text-align:center">
              <span id="${prefix}_lblDichiarato" class="DichRes">${dichiarato !== null && dichiarato !== undefined ? dichiarato : ''}</span>
            </td>
            <td style="text-align:center"><span id="${prefix}_lblSviluppoNetto"></span></td>
            <td></td>
            <td style="text-align:center">
              <span id="${prefix}_lblDifferenza">${escapeHtml(item.differenza || '0')}</span>
            </td>
            <td style="text-align:center"><span id="${prefix}_lblTestata">${escapeHtml(item.codiceTestataInterno)}</span></td>
          </tr></tbody>
        </table>
      </td></tr>`;
    })
    .join('\n');

  return `<table id="dlResa" cellspacing="0"><tbody>${righe}</tbody></table>`;
}

function paginaCompleta(titolo, corpo) {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><title>${escapeHtml(titolo)} - MD online</title></head>
<body>
${corpo}
</body>
</html>`;
}

/** Pagina compatibile con Bolla.htm-<data>-<tipo> */
function renderBollaPage(bolla, { data, tipo }) {
  const titolo = `Bolla ${data} ${tipo}`;
  const corpo = bolla ? renderDlBolla(bolla.items) : '<table id="dlBolla"><tbody></tbody></table>';
  return paginaCompleta(titolo, corpo);
}

/** Pagina compatibile con Resa.htm-<data>-<tipo>-<nome> */
function renderResaPage(resa, { data, tipo }) {
  const titolo = `Resa ${data} ${tipo}`;
  const corpo = resa ? renderDlResa(resa.items) : '<table id="dlResa"><tbody></tbody></table>';
  return paginaCompleta(titolo, corpo);
}

module.exports = { renderBollaPage, renderResaPage, renderDlBolla, renderDlResa };
