import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMasterIndex } from '../../src/data/master-loader.js';
import { ADMIN_GUARANTEE_PROFILES, adminCatalogEntries, generateAdminPreviewPack } from '../../src/ui/admin-screen.js';
import { BOOSTER_PACKS } from '../../src/gacha/pack-catalog.js';

const master = JSON.parse(readFileSync(new URL('../../src/data/master-data.json', import.meta.url), 'utf8'));
const masterIndex = createMasterIndex(master);

test('read-only admin catalog exposes every base card, special fusion and showcase illustration', () => {
  const entries = adminCatalogEntries(masterIndex);
  assert.equal(entries.filter((entry) => ['monster', 'training', 'shugyo', 'breeder'].includes(entry.kind)).length, masterIndex.cards.size);
  assert.equal(entries.filter((entry) => entry.kind === 'fusion').length, masterIndex.data.fusions.length);
  assert.equal(entries.filter((entry) => entry.kind === 'showcase').length, 24);
  assert.equal(entries.filter((entry) => entry.kind === 'fusion-showcase').length, masterIndex.data.fusions.length);
  assert.equal(entries.length, 201);
  for (const definition of masterIndex.cards.values()) {
    assert.ok(entries.some((entry) => entry.id === definition.id), `${definition.id} is visible to administrators`);
  }
});

test('admin pack previews cover every faction and deterministic guarantee profile without spending assets', () => {
  assert.deepEqual(ADMIN_GUARANTEE_PROFILES.map((profile) => profile.id), ['standard', 'featured', 'foil', 'showcase']);
  for (const pack of BOOSTER_PACKS) {
    const featured = generateAdminPreviewPack({ masterIndex, packId: pack.id, profileId: 'featured', seed: `featured:${pack.id}` });
    const foil = generateAdminPreviewPack({ masterIndex, packId: pack.id, profileId: 'foil', seed: `foil:${pack.id}` });
    const showcase = generateAdminPreviewPack({ masterIndex, packId: pack.id, profileId: 'showcase', seed: `showcase:${pack.id}` });
    assert.equal(featured.cards.length, 5);
    assert.ok(featured.cards.some((card) => card.origin === 'booster'));
    assert.ok(foil.cards.some((card) => card.finish === 'foil'));
    assert.ok(foil.cards.filter((card) => card.finish === 'foil').every((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster'));
    assert.ok(showcase.cards.some((card) => card.rarity === 'showcase' && card.artVariantId !== 'base'));
    assert.match(showcase.operationId, /^admin-preview-/);
  }
  const source = readFileSync(new URL('../../src/ui/admin-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /commitPackPurchase|acknowledgePack|saveDeck|repository|economy/);
});

test('admin entry is opt-in by URL and preview mode returns without awarding cards', () => {
  const app = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  const opening = readFileSync(new URL('../../src/ui/booster-screen.js', import.meta.url), 'utf8');
  assert.match(app, /params\.get\('admin'\) === '1'/);
  assert.match(home, /this\.adminMode \? el\('button',[\s\S]*管理者ツール/);
  assert.match(app, /previewMode: true/);
  assert.match(app, /completionLabel: '管理者ツールへ戻る'/);
  assert.match(opening, /ADMIN PREVIEW \/ 資産変更なし/);
});
