// Stessa chiave/algoritmo usati dal Gestionale Edicola per criptare username_i2/password_i2
const crypto = require('crypto');

const ENCRYPTION_KEY = crypto.createHash('sha256').update('gestionale-edicola-i2-secret-key-2025').digest();

function decripta(testo) {
  const parti = testo.split(':');
  const iv = Buffer.from(parti.shift(), 'hex');
  const encrypted = Buffer.from(parti.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { decripta };
