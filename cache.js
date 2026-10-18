// Cache dedicata di questo servizio: NON tocca le tabelle del gestionale,
// mantiene solo lo stato di ciò che è stato scaricato da I2 in autonomia.
const pool = require('./db');

async function assicuraTabella() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS i2_cache_bolle (
      id SERIAL PRIMARY KEY,
      edicolaid INTEGER NOT NULL,
      tipo VARCHAR(10) NOT NULL,
      categoria VARCHAR(20) NOT NULL,
      data_bolla DATE NOT NULL,
      disponibile BOOLEAN NOT NULL DEFAULT FALSE,
      righe JSONB,
      tentativi INTEGER NOT NULL DEFAULT 0,
      ultimo_tentativo TIMESTAMP,
      scaricato_at TIMESTAMP,
      errore TEXT,
      UNIQUE (edicolaid, tipo, categoria, data_bolla)
    )
  `);
}

async function getVoce(edicolaid, tipo, categoria, dataBollaSQL) {
  const res = await pool.query(
    `SELECT * FROM i2_cache_bolle WHERE edicolaid = $1 AND tipo = $2 AND categoria = $3 AND data_bolla = $4::date`,
    [edicolaid, tipo, categoria, dataBollaSQL]
  );
  return res.rows[0] || null;
}

async function salvaSuccesso(edicolaid, tipo, categoria, dataBollaSQL, righe) {
  await pool.query(`
    INSERT INTO i2_cache_bolle (edicolaid, tipo, categoria, data_bolla, disponibile, righe, tentativi, ultimo_tentativo, scaricato_at, errore)
    VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, 1, NOW(), NOW(), NULL)
    ON CONFLICT (edicolaid, tipo, categoria, data_bolla)
    DO UPDATE SET disponibile = $5, righe = $6::jsonb, tentativi = i2_cache_bolle.tentativi + 1,
                  ultimo_tentativo = NOW(), scaricato_at = NOW(), errore = NULL
  `, [edicolaid, tipo, categoria, dataBollaSQL, righe.length > 0, JSON.stringify(righe)]);
}

async function salvaTentativoFallito(edicolaid, tipo, categoria, dataBollaSQL, messaggioErrore) {
  await pool.query(`
    INSERT INTO i2_cache_bolle (edicolaid, tipo, categoria, data_bolla, disponibile, tentativi, ultimo_tentativo, errore)
    VALUES ($1, $2, $3, $4::date, FALSE, 1, NOW(), $5)
    ON CONFLICT (edicolaid, tipo, categoria, data_bolla)
    DO UPDATE SET tentativi = i2_cache_bolle.tentativi + 1, ultimo_tentativo = NOW(), errore = $5
  `, [edicolaid, tipo, categoria, dataBollaSQL, messaggioErrore]);
}

module.exports = { assicuraTabella, getVoce, salvaSuccesso, salvaTentativoFallito };
