import fs from 'node:fs';
import path from 'node:path';
import { MOVE_NAME_OVERRIDES } from '../src/data/move-name-overrides.js';

const root = path.resolve(import.meta.dirname, '..');
const masterPath = path.join(root, 'src', 'data', 'master-data.json');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const renamedPoolEntries = new Map();

for (const move of master.moves) {
  const nextName = MOVE_NAME_OVERRIDES[move.id];
  if (!nextName) continue;
  renamedPoolEntries.set(`${move.monsterName}\u0000${move.name}`, nextName);
  move.name = nextName;
}

for (const [monsterName, pools] of Object.entries(master.shugyoPools)) {
  for (const poolName of ['attack', 'defense']) {
    pools[poolName] = pools[poolName].map((moveName) => (
      renamedPoolEntries.get(`${monsterName}\u0000${moveName}`) ?? moveName
    ));
  }
}

master.meta.moveMaster = 'Ver2_独自技名216技';
fs.writeFileSync(masterPath, `${JSON.stringify(master, null, 2)}\n`, 'utf8');
console.log(`Applied ${Object.keys(MOVE_NAME_OVERRIDES).length} move-name overrides to ${masterPath}`);
