const PLAYER_ID_PATTERN = /^[a-z][a-z0-9_-]{3,19}$/;
const RECOVERY_EMAIL_PREFIX = 'mc.';
const RECOVERY_EMAIL_DOMAIN = 'accounts.monster-construction.invalid';

export function normalizePlayerId(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

export function validatePlayerId(value) {
  const playerId = normalizePlayerId(value);
  if (!playerId) throw new Error('復旧IDを入力してください');
  if (!PLAYER_ID_PATTERN.test(playerId)) {
    throw new Error('復旧IDは半角英字で始まる4〜20文字の英数字・ハイフン・アンダースコアで設定してください');
  }
  return playerId;
}

export function playerIdToRecoveryEmail(value) {
  return `${RECOVERY_EMAIL_PREFIX}${validatePlayerId(value)}@${RECOVERY_EMAIL_DOMAIN}`;
}

export function recoveryEmailToPlayerId(value) {
  const email = String(value ?? '').trim().toLowerCase();
  const suffix = `@${RECOVERY_EMAIL_DOMAIN}`;
  if (!email.startsWith(RECOVERY_EMAIL_PREFIX) || !email.endsWith(suffix)) return null;
  const playerId = email.slice(RECOVERY_EMAIL_PREFIX.length, -suffix.length);
  return PLAYER_ID_PATTERN.test(playerId) ? playerId : null;
}

export const PLAYER_ID_RULE_COPY = '半角英字で始まる4〜20文字（英数字・-・_）';
