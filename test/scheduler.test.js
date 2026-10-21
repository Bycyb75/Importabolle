'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

process.env.GIORNI_INDIETRO = '1';
const { generaFinestraDate } = require('../scheduler');

test('calcola oggi in Europe/Rome anche se il runner usa UTC', () => {
  const finestra = generaFinestraDate(new Date('2026-10-20T22:30:00.000Z'));

  assert.deepEqual(
    finestra.map(({ dataI2 }) => dataI2),
    ['22/10/2026', '21/10/2026', '20/10/2026']
  );
});
