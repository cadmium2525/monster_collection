export const LEGACY_MONSTER_NAMES = Object.freeze({
  'ヘンガー': 'ギアセンチネル',
  'メタルナー': 'アストラノイド',
  'ガリ': 'アルカナロード',
  'モッチー': 'ルミラビ',
  'ライガー': 'ボルトウルフ',
  'ハム': 'コンゴウ',
  'ディノ': 'フェザーレックス',
});

export function canonicalMonsterName(name) {
  return LEGACY_MONSTER_NAMES[name] ?? name;
}
