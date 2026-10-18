const cheerio = require('cheerio');

/**
 * Parser per tabelle ARRIVI (Quotidiani e C.Mista)
 * Struttura reale HTML da I2 Portal: http://edicole.m-d.srl/Bolla.htm-24/11/2025-A
 * 
 * MAPPING CAMPI PORTALE I2 → DATABASE:
 * - Titolo → titolo
 * - Numero → numero
 * - Verificato → Q.Conf (quantita_confermata)
 * - Dichiarato → Q.C. (quantita_c)
 * - Mancanze/Eccedenze → Q.D. (quantita_d)
 * - Prezzo (grande) → prezzo_lordo
 * - Prezzo (piccolo sotto) → prezzo_netto
 * - Cd → data_resa
 * - Testata → codice_pubblicazione
 * 
 * Struttura HTML:
 * - Tabella principale: <table id="dlBolla">
 * - Ogni prodotto: <tr> contenente celle <td>
 */
function parseTabellaBollaArrivi(html) {
  const $ = cheerio.load(html);
  const righe = [];

  // Trova la tabella principale con id="dlBolla"
  const mainTable = $('#dlBolla');
  if (!mainTable.length) {
    console.log('[I2-PARSER] ⚠️ Tabella dlBolla non trovata');
    return righe;
  }

  // Ogni prodotto è in un <tr> di dlBolla che contiene un <td> con <table id="record">
  mainTable.find('> tbody > tr').each((index, tr) => {
    const recordTable = $(tr).find('table#record');
    if (recordTable.length === 0) return; // Salta header e righe vuote
    
    try {
      // La riga con i dati è dentro <table id="record"><tr>
      const row = recordTable.find('tbody > tr').first();
      if (!row.length) return;
      
      // Titolo - link con id*="hlDettaglio" 
      const titoloLink = row.find('a[id*="hlDettaglio"]');
      let titolo = titoloLink.text().trim();
      
      // Estrai sottotitolo: è dentro <span style="font-size: small;"> che viene DOPO </strong>
      // Struttura: </strong><span style="font-size: small;"><br> SOTTOTITOLO</span>
      const cellaTitolo = titoloLink.closest('td');
      const spanSottotitolo = cellaTitolo.find('strong').next('span[style*="font-size: small"]');
      
      if (spanSottotitolo.length > 0) {
        const htmlSpan = spanSottotitolo.html() || '';
        // Rimuovi <br> e altri tag, poi trim
        const testoSottotitolo = htmlSpan.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').trim();
        if (testoSottotitolo && testoSottotitolo !== '&nbsp;') {
          // Concatena il sottotitolo al titolo con separatore
          titolo = `${titolo} | ${testoSottotitolo}`;
        }
      }
      
      // Debug log per prime 3 righe
      if (righe.length < 3) {
        console.log(`[I2-PARSER] 🔍 Titolo completo: "${titolo}"`);
      }
      
      // Numero - span con id*="lblNumero" (es: "51121")
      const numeroSpan = row.find('span[id*="lblNumero"]');
      const numero = numeroSpan.text().trim();
      
      // Prezzo lordo - span con id="lblPrezzo" (es: "1,50 €")
      const prezzoLordoSpan = row.find('span#lblPrezzo');
      const prezzoLordoText = prezzoLordoSpan.text().trim();
      const prezzo_lordo = parseFloat(prezzoLordoText.replace('€', '').replace(',', '.').trim()) || 0;
      
      // Prezzo netto - span con id*="lblPrezzoNetto" (es: "1,2184 €")
      const prezzoNettoSpan = row.find('span[id*="lblPrezzoNetto"]');
      const prezzoNettoText = prezzoNettoSpan.text().trim();
      const prezzo_netto = parseFloat(prezzoNettoText.replace('€', '').replace(',', '.').trim()) || 0;
      
      // Quantità DICHIARATA (Q.C.) - span con id*="lblCopie" (es: "1")
      const quantitaSpan = row.find('span[id*="lblCopie"]');
      const q_c = parseInt(quantitaSpan.text().trim()) || 0;
      
      // VERIFICATO (Q.Conf) - input con id="txtVerificato" o id*="txtVerificato" (value="1")
      const verificatoInput = row.find('input[id="txtVerificato"], input[id*="txtVerificato"]');
      const q_conf = parseInt(verificatoInput.val()) || 0;
      
      // Testata (codice pubblicazione) - span con id*="lblTestata" (es: "375")
      const testataSpan = row.find('span[id*="lblTestata"]');
      const codice_pubblicazione = testataSpan.text().trim();
      
      // Mancanze/Eccedenze (Q.D.) - span con id*="lblDifferenza" o "lblMancante" o "lblEccedenza"
      const differenzaSpan = row.find('span[id*="lblDifferenza"]');
      const mancanteSpan = row.find('span[id*="lblMancante"]');
      const eccedenzaSpan = row.find('span[id*="lblEccedenza"]');
      let q_d = 0;
      const diffText = differenzaSpan.text().trim();
      const mancText = mancanteSpan.text().trim();
      const eccText = eccedenzaSpan.text().trim();
      
      if (diffText && diffText !== '-') {
        q_d = parseInt(diffText) || 0;
      } else if (mancText && mancText !== '-') {
        q_d = parseInt(mancText) || 0;
      } else if (eccText && eccText !== '-') {
        q_d = parseInt(eccText) || 0;
      }
      
      // Data resa (Cd) - Il campo Cd può essere doppio:
      // - Sopra: simbolo € 
      // - Sotto: data di resa (es: 25/11/2025)
      // Cerchiamo la data in tutti gli span della cella "Cd"
      let data_resa = null;
      const cdCell = row.find('td').filter((i, td) => {
        const text = $(td).text().trim();
        return text.includes('€') || /\d{2}\/\d{2}\/\d{4}/.test(text);
      });
      
      if (cdCell.length) {
        // Cerca tutti gli span nella cella Cd
        const spans = cdCell.find('span');
        spans.each((i, span) => {
          const text = $(span).text().trim();
          const match = text.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (match) {
            data_resa = match[1]; // Prende la data trovata (quella sotto)
          }
        });
        
        // Se non trovata negli span, cerca nel testo della cella
        if (!data_resa) {
          const cellText = cdCell.text().trim();
          const match = cellText.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (match) {
            data_resa = match[1];
          }
        }
      }
      
      // Validazione base
      if (!titolo || !numero || !codice_pubblicazione) {
        return; // Salta riga non valida
      }
      
      const rigaDati = {
        titolo,
        numero,
        codice_pubblicazione,
        q_conf,       // "Verificato" dal portale
        q_c,          // "Dichiarato" dal portale
        q_d,          // "Mancanze/Eccedenze" dal portale
        prezzo_lordo, // Prezzo grande
        prezzo_netto, // Prezzo piccolo sotto
        data_resa     // "Cd" dal portale
      };
      
      righe.push(rigaDati);
      
      // Log dettagliato per debug (solo prime 3 righe)
      if (righe.length <= 3) {
        console.log(`[I2-PARSER] 📝 Riga ${righe.length}:`, {
          titolo: titolo.substring(0, 50),
          codice: codice_pubblicazione,
          q_conf,
          q_c,
          q_d,
          prezzo_lordo,
          prezzo_netto,
          data_resa
        });
      }
      
    } catch (error) {
      console.error(`[PARSER-ARRIVI] ⚠️ Errore parsing riga ${index}:`, error.message);
    }
  });

  console.log(`[I2-PARSER] ✅ Estratte ${righe.length} righe ARRIVI`);
  return righe;
}

/**
 * Parser per tabelle RESE (Quotidiani e C.Mista)
 * URL: http://edicole.m-d.srl/Resa.htm-19/11/2025-C-C%20Mista
 * 
 * MAPPING CAMPI PORTALE I2 (RESE) → DATABASE:
 * - Titolo → titolo
 * - Numero (5 cifre) + Data arrivo sotto → numero + data_arrivo
 * - Prezzo (doppio: sopra lordo, sotto netto) → prezzo_lordo + prezzo_netto
 * - Fornito → Q.C. (quantita_c)
 * - Dichiarato → Q.R. (quantita_r - quantità resa)
 * - Sviluppo netto → sviluppo
 * - Testata → codice_pubblicazione
 */
function parseTabellaBollaRese(html) {
  const $ = cheerio.load(html);
  const righe = [];

  console.log(`[I2-PARSER-RESE] 🔍 Inizio parsing HTML (${html.length} caratteri)`);

  // ⚠️ IMPORTANTE: Per le RESE la tabella si chiama "dlResa" NON "dlBolla"!
  const mainTable = $('#dlResa');
  if (!mainTable.length) {
    console.log('[I2-PARSER-RESE] ❌ Tabella dlResa NON trovata');
    return righe;
  }
  
  console.log(`[I2-PARSER-RESE] ✅ Tabella dlResa trovata`);

  // Stessa struttura delle ARRIVI: ogni prodotto in <tr> con <table id="record">
  const allRows = mainTable.find('> tbody > tr');
  console.log(`[I2-PARSER-RESE] 🔍 Trovate ${allRows.length} righe (TR) nella tabella`);
  
  allRows.each((index, tr) => {
    const recordTable = $(tr).find('table#record');
    if (recordTable.length === 0) {
      console.log(`[I2-PARSER-RESE] ⚠️ Riga ${index}: nessuna table#record trovata, skip`);
      return; // Salta header
    }
    
    console.log(`[I2-PARSER-RESE] 📝 Parsing riga ${index}...`);
    
    try {
      // Riga dati dentro <table id="record"><tbody><tr>
      const row = recordTable.find('tbody > tr').first();
      if (!row.length) return;
      
      // 📰 Titolo - link con id*="hlDettaglio"
      const titoloLink = row.find('a[id*="hlDettaglio"]');
      let titolo = titoloLink.text().trim();
      
      // Estrai sottotitolo: è dentro <span style="font-size: small;"> che viene DOPO </strong>
      // Struttura: </strong><span style="font-size: small;"><br> SOTTOTITOLO</span>
      const cellaTitolo = titoloLink.closest('td');
      const spanSottotitolo = cellaTitolo.find('strong').next('span[style*="font-size: small"]');
      
      if (spanSottotitolo.length > 0) {
        const htmlSpan = spanSottotitolo.html() || '';
        // Rimuovi <br> e altri tag, poi trim
        const testoSottotitolo = htmlSpan.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').trim();
        if (testoSottotitolo && testoSottotitolo !== '&nbsp;') {
          // Concatena il sottotitolo al titolo con separatore
          titolo = `${titolo} | ${testoSottotitolo}`;
        }
      }
      
      // 🔢 Numero (5 cifre) + Data arrivo sotto
      // La cella contiene: <span>51121</span><br><span>19/11/2025</span>
      const numeroCella = row.find('td').filter(function() {
        return $(this).find('span[id*="lblNumero"]').length > 0;
      }).first();
      
      const numeroSpan = numeroCella.find('span[id*="lblNumero"]');
      const numero = numeroSpan.text().trim();
      
      // Data arrivo sotto il numero (cerca dopo <br>)
      let data_arrivo = null;
      const cellaHtml = numeroCella.html();
      if (cellaHtml && cellaHtml.includes('<br>')) {
        const parts = cellaHtml.split('<br>');
        if (parts.length > 1) {
          // Estrai data dalla seconda parte
          const secondaParte = $(parts[1]).text().trim() || parts[1].replace(/<[^>]+>/g, '').trim();
          const dateMatch = secondaParte.match(/(\d{2}\/\d{2}\/\d{4})/);
          if (dateMatch) {
            data_arrivo = dateMatch[1];
          }
        }
      }
      
      // 💰 Prezzo DOPPIO: sopra lordo, sotto netto
      const prezzoCella = row.find('td').filter(function() {
        return $(this).find('span#lblPrezzo').length > 0;
      }).first();
      
      const prezzoLordoSpan = prezzoCella.find('span#lblPrezzo');
      const prezzoLordoText = prezzoLordoSpan.text().trim();
      const prezzo_lordo = parseFloat(prezzoLordoText.replace('€', '').replace(',', '.').trim()) || 0;
      
      // � Prezzo netto - span con id*="lblPrezzoNetto" (sotto il prezzo lordo)
      const prezzoNettoSpan = prezzoCella.find('span[id*="lblPrezzoNetto"]');
      let prezzo_netto = 0;
      if (prezzoNettoSpan.length) {
        const prezzoNettoText = prezzoNettoSpan.text().trim();
        prezzo_netto = parseFloat(prezzoNettoText.replace('€', '').replace(',', '.').trim()) || 0;
        console.log(`[I2-PARSER-RESE] 💰 Prezzo netto estratto da HTML: ${prezzo_netto}`);
      }
      
      // �📦 Fornito → Q.C. (quantità confermata originale)
      // L'HTML mostra "3" ma text() restituisce "30" - usa direttamente l'HTML
      const fornitoSpan = row.find('span[id*="lblFornito"], span[id*="lblCopie"]');
      const fornitoHtml = fornitoSpan.html() || '';
      
      // Usa direttamente l'HTML grezzo e converti a numero
      // L'HTML contiene solo le cifre corrette (es: "3", "15", "25")
      const q_c = parseInt(fornitoHtml.trim()) || 0;
      
      console.log(`[I2-PARSER-RESE] ✅ Riga ${index}: Fornito HTML="${fornitoHtml}" → Q.C. = ${q_c}`);
      
      // 📤 Dichiarato → Q.R. (quantità resa dichiarata)
      const dichiaratoSpan = row.find('span[id*="lblDichiarato"]');
      const dichiaratoInput = row.find('input[id*="txtDichiarato"], input[id*="txtVerificato"]');
      let q_r = 0;
      if (dichiaratoSpan.length) {
        q_r = parseInt(dichiaratoSpan.text().trim()) || 0;
      } else if (dichiaratoInput.length) {
        q_r = parseInt(dichiaratoInput.val()) || 0;
      }
      
      // 📊 Sviluppo netto
      const sviluppoSpan = row.find('span[id*="lblSviluppo"]');
      const sviluppoText = sviluppoSpan.text().trim();
      const sviluppo = parseFloat(sviluppoText.replace('€', '').replace(',', '.').trim()) || 0;
      
      // 💰 Prezzo netto: usa quello estratto dall'HTML, se non disponibile calcolalo dallo sviluppo
      if (!prezzo_netto || prezzo_netto === 0) {
        // Fallback: calcola dallo sviluppo se il prezzo netto non è stato trovato nell'HTML
        prezzo_netto = q_c > 0 ? sviluppo / q_c : 0;
        console.log(`[I2-PARSER-RESE] 💰 Prezzo netto CALCOLATO da sviluppo: ${prezzo_netto}`);
      }
      
      // 🏷️ Testata (codice pubblicazione)
      const testataSpan = row.find('span[id*="lblTestata"]');
      const codice_pubblicazione = testataSpan.text().trim();
      
      // ✅ Validazione
      if (!titolo || !numero || !codice_pubblicazione) {
        return; // Salta riga non valida
      }
      
      const rigaDati = {
        titolo,       // Include sottotitolo concatenato con " | "
        numero,
        codice_pubblicazione,
        q_c,          // "Fornito" dal portale
        q_r,          // "Dichiarato" (resa) dal portale
        prezzo_lordo, // Prezzo sopra
        prezzo_netto, // Prezzo sotto
        sviluppo,     // "Sviluppo netto"
        data_arrivo   // Data sotto il numero
      };
      
      righe.push(rigaDati);
      
      // Log per debug (prime 3 righe)
      if (righe.length <= 3) {
        console.log(`[I2-PARSER-RESE] 📝 Riga ${righe.length}:`, {
          titolo: titolo.substring(0, 30),
          numero,
          codice: codice_pubblicazione,
          q_c,
          q_r,
          sviluppo,
          data_arrivo
        });
      }
      
    } catch (error) {
      console.error(`[PARSER-RESE] ⚠️ Errore parsing riga ${index}:`, error.message);
    }
  });

  console.log(`[I2-PARSER] ✅ Estratte ${righe.length} righe RESE`);
  return righe;
}

/**
 * Estrai data dalla pagina bolla
 * Il titolo reale è: "Bolla 21/11/2025 A - MD online"
 */
function estraiDataBolla(html) {
  const $ = cheerio.load(html);
  
  // Cerca nel titolo della pagina
  const titleText = $('title').text();
  const match = titleText.match(/Bolla\s+(\d{2}\/\d{2}\/\d{4})/i);
  
  if (match) {
    return match[1]; // Formato DD/MM/YYYY
  }
  
  // Fallback: cerca in qualsiasi testo
  const bodyText = $('body').text();
  const fallbackMatch = bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }
  
  return null;
}

module.exports = {
  parseTabellaBollaArrivi,
  parseTabellaBollaRese,
  estraiDataBolla
};
