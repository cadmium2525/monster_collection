import fs from 'node:fs';
import path from 'node:path';
import { readSheet } from './read-ooxml-sheet.mjs';

const root = path.resolve(import.meta.dirname, '..');
const workbook = path.join(root, '.tmp_master_main', 'xl', 'worksheets');
const output = path.join(root, 'src', 'data', 'master-data.json');

function records(sheetNumber) {
  const [headers, ...rows] = readSheet(path.join(workbook, `sheet${sheetNumber}.xml`));
  return rows
    .filter((row) => row.some((value) => value !== '' && value != null))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function number(value) {
  const parsed = Number.parseFloat(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(value) {
  return String(value).padStart(3, '0');
}

const monsterRows = records(1);
const moveRows = records(2);
const breederRows = records(3);
const fusionRows = records(5);

const MONSTER_RENAMES = Object.freeze({
  'ヘンガー': 'ギアセンチネル',
  'メタルナー': 'アストラノイド',
  'ガリ': 'アルカナロード',
  'モッチー': 'ルミラビ',
  'ライガー': 'ボルトウルフ',
  'ハム': 'コンゴウ',
  'ディノ': 'フェザーレックス',
});

function monsterName(value) {
  return MONSTER_RENAMES[value] ?? value;
}

const moveIdsByMonster = new Map();
const moves = moveRows.map((row, index) => {
  const id = `move-${pad(index + 1)}`;
  const ownerName = monsterName(row['モンスター']);
  if (!moveIdsByMonster.has(ownerName)) moveIdsByMonster.set(ownerName, []);
  moveIdsByMonster.get(ownerName).push(id);
  return {
    id,
    monsterName: ownerName,
    name: row['技名'],
    rank: number(row['Rank']),
    power: row['威力'] === '―' ? null : number(row['威力']),
    tp: number(row['TP']),
    effect: row['効果'] || '―',
    initial: row['初期技'] === '○',
    legacyDistance: row['距離'],
  };
});

const monsters = monsterRows.map((row, index) => ({
  id: `monster-${pad(index + 1)}`,
  kind: 'monster',
  faction: row['モン類'],
  name: monsterName(row['モンスター']),
  summonTp: number(row['召喚TP']),
  base: {
    life: number(row['LIFE']),
    atk: number(row['ATK']),
    def: number(row['DEF']),
  },
  role: row['役割'],
  trait: {
    name: row['特性名'],
    effect: row['特性効果'],
  },
  moveIds: moveIdsByMonster.get(monsterName(row['モンスター'])) ?? [],
  legacyPreferredDistance: row['得意距離'],
}));

const breeders = breederRows.map((row, index) => ({
  id: `breeder-${pad(index + 1)}`,
  kind: 'breeder',
  category: row['種別'],
  faction: row['種別'] === 'モン類専用' ? row['カード'].replace(/[①②]/g, '') : null,
  name: row['カード'],
  tp: number(row['TP']),
  effect: row['効果'],
}));

const fusions = fusionRows.map((row, index) => ({
  id: `fusion-${pad(index + 1)}`,
  main: monsterName(row['メイン']),
  material: monsterName(row['サブ']),
  name: row['特殊個体'],
  trait: row['固有特性'],
  archetype: row['設計タイプ'],
  powerIndex: number(row['Sim7.19 Power Index']),
  verdict: row['Sim7.19判定'],
  watch: row['監視'],
}));

const growthCards = [
  { id: 'training-life', kind: 'training', name: 'LIFEトレーニング', tp: 2, stat: 'life', amount: 5, effect: '対象モンスター1体のLIFE+5' },
  { id: 'training-atk', kind: 'training', name: 'ATKトレーニング', tp: 2, stat: 'atk', amount: 5, effect: '対象モンスター1体のATK+5' },
  { id: 'training-def', kind: 'training', name: 'DEFトレーニング', tp: 2, stat: 'def', amount: 5, effect: '対象モンスター1体のDEF+5' },
  { id: 'shugyo-attack', kind: 'shugyo', name: '攻撃修行', tp: 5, stat: 'atk', amountRange: [5, 10], effect: '対象のLIFEとATKが各+5～10。攻撃修行の技をランダムに1つ習得' },
  { id: 'shugyo-defense', kind: 'shugyo', name: '防御修行', tp: 5, stat: 'def', amountRange: [5, 10], effect: '対象のLIFEとDEFが各+5～10。防御修行の技をランダムに1つ習得' },
];

const shugyoPools = {
  'プラント': { attack: ['ドレイン', '根縛り', 'エナジードレイン'], defense: ['フラワービーム', '毒花粉', '花粉'] },
  'ルミラビ': { attack: ['もっさん', 'ローリンモッチ', 'もっさまん'], defense: ['超モッチ砲', 'モッチ砲', 'ガッチャー'] },
  'ウンディーネ': { attack: ['メイルストローム', 'アクアウェイブ', 'フリーズランス'], defense: ['アイスストーム', 'アクアスピア', 'アイスクラッシュ'] },
  'ピクシー': { attack: ['ギガレイ', 'デスキッス', 'ビッグバン'], defense: ['レイ', 'キック', 'ライトニング'] },
  'デュラハン': { attack: ['連続斬り', '冥王剣', '真空斬'], defense: ['真・風神剣', '最終奥義', '大車輪'] },
  'ドラゴン': { attack: ['ルインクロス', 'インフェルノ', 'しっぽアタック'], defense: ['ドラゴンラッシュ', 'ドラゴンパンチ', 'ウイングアタック'] },
  'ボルトウルフ': { attack: ['雷牙', 'サンダー', 'ワンツー'], defense: ['雷撃', '空中回転アタック', '超雷撃'] },
  'コンゴウ': { attack: ['連続パンチ', '超飛び蹴り', '超ドラゴンパンチ'], defense: ['ドラゴンパンチ', '大砲屁', 'バックナックル'] },
  'フェザーレックス': { attack: ['暴れまわり', '火炎連砲', '突進'], defense: ['しっぽビンタ', '連続かみつき', '火炎'] },
  'ジョーカー': { attack: ['デススラッシュ', 'デスエナジー', 'デスナックル'], defense: ['デスファイナル', 'デスゲート', 'デスウェーブ'] },
  'ワーム': { attack: ['大毒液', '毒牙', '毒液'], defense: ['連続突き', '牙斬り', 'くし刺し'] },
  'ゴースト': { attack: ['ソウルビーム', 'ナイトメア', 'コンビネーション'], defense: ['ソウルショット', '大きなおとしもの', '大パンチ'] },
  'モノリス': { attack: ['ひっかき', 'フォームアルファ', 'デルタアタック'], defense: ['怪光線', 'トリオビームX', 'トリオビームY'] },
  'ギアセンチネル': { attack: ['アイショット', 'ドリルアタック', 'ロケットパンチ'], defense: ['ギガレーザー', 'ダブルアタック', 'アームキャノン'] },
  'ゴーレム': { attack: ['大地震', '地震', '竜巻アタック'], defense: ['大パンチ', 'ハンマーナックル', 'ロケットパンチ'] },
  'ヒノトリ': { attack: ['フレイムタイフーン', 'フレイムライン', 'かぎづめ'], defense: ['エタニティフレア', 'ファイアウェーブ', 'ファイアビーム'] },
  'アストラノイド': { attack: ['超メタビーム', 'テツざんこう', 'ツイン掌打'], defense: ['宙ポン拳', '閃光掌', '右たん脚'] },
  'アルカナロード': { attack: ['ホーリーサンダー', 'ゴッドファイナル', '神の怒り'], defense: ['プレス', 'ゴッドストライク', 'ゴッドアタック'] },
};

const master = {
  meta: {
    savepoint: 'Sim8.7_完全展開版',
    cardMaster: 'Ver5_Sim7.19',
    moveMaster: 'Ver1_162技',
    generatedAt: '2026-08-24',
    distanceSystem: 'removed-by-user-amendment-2026-08-24',
    legacyDistanceFieldsAreNonGameplay: true,
  },
  monsters,
  moves,
  breeders,
  growthCards,
  fusions,
  shugyoPools,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(master, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);
console.log(`${monsters.length} monsters, ${moves.length} moves, ${breeders.length} breeders, ${fusions.length} fusions`);
