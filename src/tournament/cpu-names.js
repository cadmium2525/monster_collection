const FIRST = ['蒼井', '黒瀬', '天城', '篠宮', '火神', '白波', '霧島', '久遠', '獅堂', '月城', '葛城', '東雲', '神代', '御影', '鳴海', '雨宮', '冬木', '千早', '真田', '榊'];
const CALL = ['レイ', 'カイ', 'ミナト', 'ユナ', 'トウマ', 'リン', 'シオン', 'ナギ', 'アキラ', 'セナ', 'ヒカリ', 'クロウ', 'マコト', 'ルカ', 'ソラ', 'レン', 'イオ', 'ノア', 'ハル', 'ジン'];

export function generateCpuNames(count, rng) {
  const combinations = [];
  for (const family of rng.shuffle(FIRST)) for (const call of rng.shuffle(CALL)) combinations.push(`${family} ${call}`);
  return combinations.slice(0, count);
}
