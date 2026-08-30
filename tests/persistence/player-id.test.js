import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePlayerId,
  playerIdToRecoveryEmail,
  recoveryEmailToPlayerId,
  validatePlayerId,
} from '../../src/persistence/player-id.js';

test('player IDs are normalized and mapped to a non-routable synthetic address', () => {
  assert.equal(normalizePlayerId('  ＫＡＤＯ_2525  '), 'kado_2525');
  assert.equal(validatePlayerId('Kado-2525'), 'kado-2525');
  const email = playerIdToRecoveryEmail('Kado-2525');
  assert.equal(email, 'mc.kado-2525@accounts.monster-construction.invalid');
  assert.equal(recoveryEmailToPlayerId(email), 'kado-2525');
  assert.equal(recoveryEmailToPlayerId('player@example.com'), null);
});

test('player IDs reject ambiguous or unsafe input', () => {
  for (const invalid of ['', 'abc', '1player', 'プレイヤー', 'player@example.com', 'a'.repeat(21)]) {
    assert.throws(() => validatePlayerId(invalid));
  }
});
