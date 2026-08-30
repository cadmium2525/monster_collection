import { createMasterIndex, loadMasterData } from '../src/data/master-loader.js';
import { createFusionAnimationModel, playFusionAnimation } from '../src/ui/fusion-animation.js';

function qaUnit(definition, overrides = {}) {
  return {
    id: 'qa-main',
    sourceMasterId: definition.id,
    name: definition.name,
    baseMonsterName: definition.name,
    faction: definition.faction,
    role: definition.role,
    traitName: definition.trait.name,
    traitEffect: definition.trait.effect,
    specialForm: null,
    specialFusionId: null,
    specialTrait: null,
    maxLife: definition.base.life,
    life: definition.base.life,
    atkBase: definition.base.atk,
    defBase: definition.base.def,
    atkMod: 0,
    defMod: 0,
    temporaryAtk: 0,
    temporaryDef: 0,
    timedDefBuffs: [],
    statuses: {},
    actionPoints: 0,
    summonedThisTurn: false,
    stunnedThisTurn: false,
    ...overrides,
  };
}

const masterData = await loadMasterData();
const masterIndex = createMasterIndex(masterData);

function model(special) {
  const mainDefinition = masterIndex.monstersByName.get(special ? 'ピクシー' : 'ドラゴン');
  const materialDefinition = masterIndex.monstersByName.get(special ? 'アストラノイド' : 'ボルトウルフ');
  const beforeUnit = qaUnit(mainDefinition);
  const afterUnit = qaUnit(mainDefinition, {
    specialForm: special ? 'フューチャー' : null,
    specialFusionId: special ? 'fusion-001' : null,
    specialTrait: special ? masterData.fusions[0].trait : null,
    maxLife: mainDefinition.base.life + 10,
    life: mainDefinition.base.life + 10,
    atkBase: mainDefinition.base.atk + 7,
    defBase: mainDefinition.base.def + 5,
  });
  return createFusionAnimationModel({
    action: { type: special ? 'fusion-special' : 'fusion-normal', unitId: 'qa-main', materialCardInstanceId: 'qa-material' },
    beforePlayer: {
      board: [beforeUnit],
      hand: [{ instanceId: 'qa-material', masterId: materialDefinition.id }],
      tournamentGrowth: {},
    },
    afterPlayer: { board: [afterUnit] },
    masterIndex,
  });
}

document.querySelector('#normal').addEventListener('click', () => playFusionAnimation({ model: model(false) }));
document.querySelector('#special').addEventListener('click', () => playFusionAnimation({ model: model(true) }));
document.querySelector('#special-fast').addEventListener('click', () => playFusionAnimation({ model: model(true), speed: 'fast' }));

const autoplay = new URLSearchParams(location.search).get('autoplay');
if (autoplay) setTimeout(() => playFusionAnimation({
  model: model(autoplay !== 'normal'),
  speed: autoplay === 'fast' ? 'fast' : 'standard',
}), 180);
