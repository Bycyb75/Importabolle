// Scraper standalone: un solo login per sessione, poi riusa la stessa pagina
// per scaricare più documenti (evita di autenticarsi decine di volte di fila,
// cosa che il portale I2 considera un comportamento sospetto e blocca).
const { chromium } = require('playwright');

const I2_BASE_URL = 'http://edicole.m-d.srl';
const I2_LOGIN_URL = `${I2_BASE_URL}/Login.htm`;

async function apriSessione(username, password) {
  const browser = await chromium.launch({ headless: true });
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

  try {
    await page.waitForURL(u => {
      const s = u.toString();
      return s.includes('HomeEdicola.htm') || s.includes('SelezioneBolla.htm');
    }, { timeout: 120000 });
  } catch (_) {
    // Se scade il timeout, verifica comunque l'URL corrente qui sotto
  }

  if (page.url().includes('Login.htm')) {
    await browser.close();
    throw new Error('Login fallito - credenziali errate');
  }

  return { browser, page };
}

async function scaricaConSessione(page, tipo, categoria, data) {
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

  return await page.content();
}

module.exports = { apriSessione, scaricaConSessione };

