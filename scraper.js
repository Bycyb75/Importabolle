// Scraper standalone e "stateless": per ogni richiesta apre un browser headless,
// fa login con utente/password e scarica la pagina richiesta, poi chiude tutto.
const { chromium } = require('playwright');

const I2_BASE_URL = 'http://edicole.m-d.srl';
const I2_LOGIN_URL = `${I2_BASE_URL}/Login.htm`;

async function scaricaDocumento(username, password, tipo, categoria, data) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await page.goto(I2_LOGIN_URL, { timeout: 180000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#txtUsername', { timeout: 60000 });
    await page.fill('#txtUsername', username);
    await page.fill('#txtPassword', password);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 120000 }).catch(() => {}),
      page.click('#BtnLogin', { delay: 100 })
    ]);
    await page.waitForTimeout(3000);

    // Il sito I2 può essere lento: attendi fino a 2 minuti il redirect post-login
    try {
      await page.waitForURL(u => {
        const s = u.toString();
        return s.includes('HomeEdicola.htm') || s.includes('SelezioneBolla.htm');
      }, { timeout: 120000 });
    } catch (_) {
      // Se scade il timeout, verifica comunque l'URL corrente qui sotto
    }

    const urlDopoLogin = page.url();
    if (urlDopoLogin.includes('Login.htm')) {
      throw new Error('Login fallito - credenziali errate');
    }

    // Costruisci URL documento (ARRIVI o RESE)
    const codiceCat = categoria === 'quotidiani' ? 'A' : 'C';
    let url;
    if (tipo === 'arrivi') {
      url = `${I2_BASE_URL}/Bolla.htm-${data}-${codiceCat}`;
    } else {
      const nomeCat = categoria === 'quotidiani' ? 'A%20Quotidiani' : 'C%20Mista';
      url = `${I2_BASE_URL}/Resa.htm-${data}-${codiceCat}-${nomeCat}`;
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(5000);

    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

module.exports = { scaricaDocumento };
