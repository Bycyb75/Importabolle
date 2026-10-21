// Gestisce login e recupero pagine autenticate dal portale MD online (edicole.m-d.srl)
'use strict';

const fetchCookie = require('fetch-cookie').default;
const { CookieJar } = require('tough-cookie');

/**
 * Crea un client HTTP con gestione automatica dei cookie di sessione,
 * effettua il login e restituisce una funzione "get(path)" già autenticata.
 */
async function createClient({ baseUrl, username, password }) {
  const jar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, jar);

  // 1) Visita la pagina di login per ottenere il cookie di sessione iniziale (ASP.NET_SessionId)
  const loginPageRes = await fetchWithCookies(`${baseUrl}/Login.htm`);
  if (!loginPageRes.ok) {
    throw new Error(`Impossibile aprire la pagina di login (HTTP ${loginPageRes.status})`);
  }
  await loginPageRes.text();

  // 2) Esegue il login tramite la stessa chiamata AJAX usata dal sito (vedi Login.min.js -> LogMeIn)
  const loginRes = await fetchWithCookies(`${baseUrl}/Account/Login.aspx/LogMeIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ username, password, remember: 'false' }),
  });

  if (!loginRes.ok) {
    throw new Error(`Richiesta di login fallita (HTTP ${loginRes.status})`);
  }

  const loginData = await loginRes.json();
  const result = String(loginData.d || '').replace(/^"|"$/g, '');

  if (result !== 'EdicolaOK') {
    throw new Error(
      `Login non riuscito (risposta del server: "${result}"). Controlla username e password in .env`
    );
  }

  // 3) Espone un helper per scaricare pagine autenticate come testo HTML
  async function getHtml(path) {
    const res = await fetchWithCookies(`${baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`Errore nel recupero di ${path} (HTTP ${res.status})`);
    }
    return res.text();
  }

  return { getHtml };
}

module.exports = { createClient };
