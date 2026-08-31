import fs from 'node:fs';
import path from 'node:path';

const masterPath = path.resolve(import.meta.dirname, '..', 'src', 'data', 'master-data.json');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

const recipes = [
  {
    id: 'fusion-049', main: 'アークヴァルキア', material: 'ワーム', name: 'アビスヴァルキア',
    trait: '各ターン最初の技はDEF8無視。ダメージを与えた場合、対象DEF-3',
    archetype: '貫通・弱体', powerIndex: 116,
  },
  {
    id: 'fusion-050', main: 'アークヴァルキア', material: 'ピクシー', name: 'フェアリアーク',
    trait: '各ターン最初の技TP-1（最低1）。使用後、次の被ダメージを20%軽減',
    archetype: 'TP効率・防御', powerIndex: 115,
  },
  {
    id: 'fusion-051', main: 'セラフィノア', material: 'ジョーカー', name: 'エクリシエル',
    trait: '自ターン開始時、LIFE50%超なら次の技ダメージ+20%、LIFE50%以下ならLIFE8%回復',
    archetype: '変転・攻防', powerIndex: 116,
  },
  {
    id: 'fusion-052', main: 'セラフィノア', material: 'ボルトウルフ', name: 'ボルトセラフィア',
    trait: '各ターン最初の被ダメージを25%軽減。軽減後、次の技ダメージ+15%',
    archetype: '防御・反撃', powerIndex: 117,
  },
  {
    id: 'fusion-053', main: 'カスミヨ', material: 'アストラノイド', name: 'アストラカスミヨ',
    trait: '各ターン最初の技TP-1（最低1）かつDEF8無視',
    archetype: 'TP効率・貫通', powerIndex: 118,
  },
  {
    id: 'fusion-054', main: 'カスミヨ', material: 'ゴースト', name: '幽月カスミヨ',
    trait: '各ターン最初の技でダメージを与えた時LIFE6%回復。その技で敵撃破時TP1回復',
    archetype: '吸収・継戦', powerIndex: 116,
  },
  {
    id: 'fusion-055', main: 'リリヴェル', material: 'グラトン', name: 'グラトニアリリス',
    trait: '敵撃破時、LIFE8回復・ATK+2（ATK上昇は最大+6）',
    archetype: '撃破・成長', powerIndex: 116,
  },
  {
    id: 'fusion-056', main: 'リリヴェル', material: 'ルミラビ', name: 'ルナリリヴェル',
    trait: '各ターン最初の技TP-1（最低1）。LIFE50%以下で与ダメージ20%増加',
    archetype: 'TP効率・逆境', powerIndex: 117,
  },
  {
    id: 'fusion-057', main: 'レオネア', material: 'ノクティス', name: 'ノクスレオネア',
    trait: 'LIFE50%超では各ターン最初の被ダメージ20%軽減。LIFE50%以下では与ダメージ20%増加',
    archetype: '変転・攻防', powerIndex: 116,
  },
  {
    id: 'fusion-058', main: 'レオネア', material: 'プラント', name: 'ヴェルデレオネア',
    trait: '自ターン開始時LIFE5%回復。回復した場合、次の技ダメージ+15%',
    archetype: '再生・火力', powerIndex: 115,
  },
  {
    id: 'fusion-059', main: 'ミメシア', material: 'ゴーレム', name: 'ガイアミメシア',
    trait: '20以上の被ダメージを20%軽減。軽減量を最大10まで蓄積し、次の技ダメージへ加算',
    archetype: '防御・反射', powerIndex: 119,
  },
  {
    id: 'fusion-060', main: 'ミメシア', material: 'アルカナロード', name: 'アルカナミメシア',
    trait: 'ターン終了時、最低項目に応じてLIFE8%回復/ATK+3/DEF+3',
    archetype: '万能・補正', powerIndex: 115,
  },
].map((recipe) => ({
  ...recipe,
  verdict: recipe.powerIndex >= 118 ? '強め監視' : '基準帯',
  watch: recipe.powerIndex >= 118 ? '監視' : '通常',
}));

for (const recipe of recipes) {
  const existingIndex = master.fusions.findIndex((fusion) => fusion.id === recipe.id);
  if (existingIndex >= 0) master.fusions[existingIndex] = recipe;
  else master.fusions.push(recipe);
}

master.fusions.sort((a, b) => a.id.localeCompare(b.id));
master.meta.expectedFusionCount = 60;
master.meta.thirdGenerationFusions = 'Six Heroines 12 recipes 2026-08-31';

fs.writeFileSync(masterPath, `${JSON.stringify(master, null, 2)}\n`, 'utf8');
console.log(`Updated ${masterPath}: ${master.fusions.length} fusions`);
