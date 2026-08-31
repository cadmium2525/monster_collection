import fs from 'node:fs';
import path from 'node:path';

const masterPath = path.resolve(import.meta.dirname, '..', 'src', 'data', 'master-data.json');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

const specs = [
  {
    id: 'monster-025', faction: '機鋼', name: 'アークヴァルキア', summonTp: 4,
    base: { life: 25, atk: 30, def: 25 }, role: 'バランス',
    trait: { name: '偏向機翼', effect: '各ターン、最初に受ける技ダメージを15%軽減する。', engine: { firstIncomingReduction: 0.15 } },
    moves: [
      ['蒼雷突', 1, 100, 1, '―', true], ['翼輪斬', 1, 105, 2, '対象DEF-5', true], ['機装閃', 2, 110, 2, '使用後、自身DEF+5', true],
      ['空戦連刃', 3, 120, 3, '対象ATK-5'], ['天衝レール', 4, 135, 4, '追加でDEF5無視'], ['蒼穹終槍', 5, 150, 5, '使用後、自身DEF-5'],
      ['偏向羽盾', 2, 105, 2, '対象ATK-5'], ['機翼反転', 3, 115, 3, '使用後、自身ATK+5'], ['雷光包囲', 4, 130, 4, '対象DEF-5'],
    ],
  },
  {
    id: 'monster-026', faction: '神造', name: 'セラフィノア', summonTp: 4,
    base: { life: 30, atk: 25, def: 25 }, role: 'タンク',
    trait: { name: '聖晶再生', effect: '自分ターン開始時、自身のLIFEを5回復する。', engine: { turnStartHeal: 5 } },
    moves: [
      ['光紡ぎ', 1, 100, 1, '―', true], ['聖晶針', 1, 105, 2, '対象DEF-5', true], ['祝輪', 2, 110, 2, '自身LIFE5回復', true],
      ['天階裁断', 3, 120, 3, '対象ATK-5'], ['星冠照射', 4, 135, 4, '追加でDEF5無視'], ['神域再編', 5, 145, 5, '使用後、自身ATK+5'],
      ['琥珀守護', 2, 105, 2, '使用後、自身DEF+5'], ['光律共鳴', 3, 115, 3, '対象ATK-5'], ['創世黎明', 4, 130, 4, '自身LIFE5回復'],
    ],
  },
  {
    id: 'monster-027', faction: '幻霊', name: 'カスミヨ', summonTp: 3,
    base: { life: 20, atk: 30, def: 15 }, role: 'アタッカー',
    trait: { name: '幽世渡り', effect: '召喚時、攻撃を1度だけ完全回避する状態を得る。', engine: { evadeOnSummon: true } },
    moves: [
      ['霧灯', 1, 100, 1, '―', true], ['鏡月刃', 1, 105, 2, '対象DEF-5', true], ['狐火送り', 2, 110, 2, '対象ATK-5', true],
      ['朧渡り', 3, 120, 3, '使用後、自身ATK+5'], ['六灯葬', 4, 135, 4, '追加でDEF5無視'], ['常夜水鏡', 5, 150, 5, '使用後、自身DEF-5'],
      ['霞衣', 2, 105, 2, '使用後、自身DEF+5'], ['月影返し', 3, 115, 3, '対象ATK-5'], ['幽明輪舞', 4, 130, 4, '対象DEF-5'],
    ],
  },
  {
    id: 'monster-028', faction: '魔族', name: 'リリヴェル', summonTp: 4,
    base: { life: 25, atk: 35, def: 15 }, role: 'アタッカー',
    trait: { name: '血月の契約', effect: 'LIFE50%以下なら技TP-1（最低1）。', engine: { lowLifeMoveDiscount: 1 } },
    moves: [
      ['紅針', 1, 100, 1, '―', true], ['影踏み', 1, 105, 2, '対象DEF-5', true], ['夜会斬', 2, 110, 2, '使用後、自身ATK+5', true],
      ['黒蝶連舞', 3, 125, 3, '対象ATK-5'], ['深紅穿ち', 4, 140, 4, '追加でDEF5無視'], ['月蝕決闘', 5, 155, 5, '使用後、自身LIFE-5'],
      ['宵闇受け', 2, 105, 2, '使用後、自身DEF+5'], ['魔宴返し', 3, 115, 3, '対象ATK-5'], ['緋晶散華', 4, 130, 4, '対象DEF-5'],
    ],
  },
  {
    id: 'monster-029', faction: '獣族', name: 'レオネア', summonTp: 3,
    base: { life: 25, atk: 30, def: 20 }, role: 'アタッカー',
    trait: { name: '先陣の咆哮', effect: '各ターン最初に使う技のダメージ+15%。', engine: { firstMoveDamageBonus: 0.15 } },
    moves: [
      ['砂牙', 1, 100, 1, '―', true], ['双爪閃', 1, 105, 2, '対象DEF-5', true], ['獅子駆け', 2, 110, 2, '使用後、自身ATK+5', true],
      ['旋牙乱舞', 3, 120, 3, '対象ATK-5'], ['王獣跳撃', 4, 135, 4, '追加でDEF5無視'], ['金獅烈破', 5, 150, 5, '使用後、自身DEF-5'],
      ['砂塵受け', 2, 105, 2, '使用後、自身DEF+5'], ['獣王返し', 3, 115, 3, '対象ATK-5'], ['夕陽双月', 4, 130, 4, '対象DEF-5'],
    ],
  },
  {
    id: 'monster-030', faction: '怪物', name: 'ミメシア', summonTp: 4,
    base: { life: 35, atk: 25, def: 20 }, role: 'バランス',
    trait: { name: '貪欲擬態', effect: '敵を撃破するたび、自身のLIFEを8回復する。', engine: { healOnKill: 8 } },
    moves: [
      ['金貨弾', 1, 100, 1, '―', true], ['粘晶爪', 1, 105, 2, '対象DEF-5', true], ['宝箱噛み', 2, 110, 2, '自身LIFE5回復', true],
      ['逆重力財宝', 3, 120, 3, '対象ATK-5'], ['万眼の蓋', 4, 135, 4, '追加でDEF5無視'], ['深淵大収蔵', 5, 145, 5, 'LIFE5追加回復'],
      ['液鎧変成', 2, 105, 2, '使用後、自身DEF+5'], ['偽宝反射', 3, 115, 3, '対象ATK-5'], ['王庫雪崩', 4, 130, 4, '対象DEF-5'],
    ],
  },
];

let moveNumber = 217;
for (const spec of specs) {
  const moveIds = spec.moves.map((move) => `move-${String(moveNumber++).padStart(3, '0')}`);
  if (!master.monsters.some((monster) => monster.id === spec.id)) {
    master.monsters.push({
      id: spec.id, kind: 'monster', faction: spec.faction, name: spec.name,
      summonTp: spec.summonTp, base: spec.base, role: spec.role, trait: spec.trait,
      moveIds, legacyPreferredDistance: '中距離',
    });
  }
  spec.moves.forEach(([name, rank, power, tp, effect, initial = false], index) => {
    const id = moveIds[index];
    if (!master.moves.some((move) => move.id === id)) {
      master.moves.push({ id, monsterName: spec.name, name, rank, power, tp, effect, initial, legacyDistance: '中距離' });
    }
  });
  master.shugyoPools[spec.name] = {
    attack: spec.moves.slice(3, 6).map(([name]) => name),
    defense: spec.moves.slice(6, 9).map(([name]) => name),
  };
}

master.meta.expectedMonsterCount = 30;
master.meta.expectedMoveCount = 270;
master.meta.moveMaster = 'Ver3_独自技名270技';
master.meta.boosterExpansion = 'Six Heroines 2026-08-31';

fs.writeFileSync(masterPath, `${JSON.stringify(master, null, 2)}\n`, 'utf8');
console.log(`Updated ${masterPath}: ${master.monsters.length} monsters, ${master.moves.length} moves`);
