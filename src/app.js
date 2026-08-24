import { loadMasterData, createMasterIndex } from './data/master-loader.js';
import { BattleEngine } from './battle/BattleEngine.js';
import { defaultSimulationPolicy } from './battle/simulation.js';
import { el, replace } from './ui/dom.js';
import { BattleScreen } from './ui/battle-screen.js';

function demoDeck(master, deckId) {
  const masterIds = master.monsters.flatMap((monster) => [monster.id, monster.id]);
  masterIds.push(...master.growthCards.slice(0, 4).map((card) => card.id));
  return masterIds.map((masterId, index) => ({ instanceId: `${deckId}-card-${index + 1}`, masterId }));
}

async function boot() {
  const root = document.querySelector('#app');
  try {
    const masterData = await loadMasterData();
    const masterIndex = createMasterIndex(masterData);
    const seed = new URLSearchParams(location.search).get('seed') ?? `web-${Date.now().toString(36)}`;
    const engine = new BattleEngine({
      masterData,
      seed,
      players: [
        { id: 'player', displayName: 'あなた', deckId: 'demo-player', cards: demoDeck(masterData, 'demo-player') },
        { id: 'cpu', displayName: '訓練CPU', deckId: 'demo-cpu', cards: demoDeck(masterData, 'demo-cpu') },
      ],
    });
    new BattleScreen({
      root,
      engine,
      humanPlayerId: 'player',
      chooseCpuAction: (battle, playerId, rng) => defaultSimulationPolicy(battle, playerId, rng),
      onComplete: () => location.reload(),
    });
    window.__MC_DEBUG__ = { engine, masterData, masterIndex };
  } catch (error) {
    console.error(error);
    replace(root, el('main', { className: 'error-screen' }, [
      el('div', { className: 'brand-mark', text: '!' }),
      el('h1', { text: '起動できませんでした' }),
      el('pre', { text: error.stack ?? error.message }),
      el('button', { className: 'primary-button', text: '再読み込み', onclick: () => location.reload() }),
    ]));
  }
}

boot();
