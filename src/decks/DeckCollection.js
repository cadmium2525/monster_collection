import { normalizeDeckCards, representativeMonster, totalPlayTp, validateDeck } from '../battle/deck.js';
import { TOURNAMENTS } from '../battle/rules.js';
import { normalizeCardAppearance } from '../cards/card-appearance.js';

const MAX_DECKS = 5;

function clone(value) { return structuredClone(value); }
function rankIndex(rank) { return TOURNAMENTS.indexOf(rank); }

function validName(name) {
  const normalized = String(name ?? '').trim();
  if (!normalized) throw new Error('デッキ名を入力してください');
  if ([...normalized].length > 30) throw new Error('デッキ名は30文字以内です');
  return normalized;
}

function representativeId(cards, masterIndex, requestedId = null) {
  const monsterIds = new Set(cards
    .filter((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster')
    .map((card) => card.masterId));
  if (requestedId && monsterIds.has(requestedId)) return requestedId;
  return representativeMonster(cards, masterIndex)?.id ?? null;
}

export class DeckCollection {
  constructor({ masterIndex, records = [], now = () => new Date().toISOString(), idFactory = null }) {
    this.masterIndex = masterIndex;
    this.now = now;
    this.sequence = records.length;
    this.idFactory = idFactory ?? (() => `deck-${Date.now().toString(36)}-${++this.sequence}`);
    this.records = records.map((record) => this._normalizeRecord(record));
    if (this.records.length > MAX_DECKS) throw new Error(`保存デッキは最大${MAX_DECKS}個です`);
    if (new Set(this.records.map((record) => record.deckId)).size !== this.records.length) throw new Error('deckIdが重複しています');
  }

  _normalizeRecord(record) {
    const deckId = String(record.deckId);
    const cards = normalizeDeckCards(record.cards, deckId);
    const validation = validateDeck(cards, this.masterIndex, { deckId });
    if (!validation.valid) throw new Error(`不正な保存デッキ ${deckId}:\n${validation.errors.join('\n')}`);
    const qualification = TOURNAMENTS.includes(record.qualification) ? record.qualification : 'bronze';
    const highestReached = TOURNAMENTS.includes(record.highestReached) ? record.highestReached : 'bronze';
    return {
      deckId,
      deckName: validName(record.deckName),
      cards,
      pool: (record.pool ?? []).map((card, index) => normalizeCardAppearance({
        ...clone(card),
        instanceId: card.instanceId ?? `${deckId}-pool-${String(index + 1).padStart(3, '0')}`,
        masterId: card.masterId,
        artVariantId: card.artVariantId ?? 'base',
        finish: card.finish ?? 'normal',
        origin: card.origin ?? 'core',
      })).filter((card) => this.masterIndex.cards.has(card.masterId)),
      qualification,
      highestReached,
      totalPlayTp: totalPlayTp(cards, this.masterIndex),
      representativeMonsterId: representativeId(cards, this.masterIndex, record.representativeMonsterId),
      createdAt: record.createdAt ?? this.now(),
      updatedAt: record.updatedAt ?? this.now(),
    };
  }

  list() { return clone([...this.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }

  get(deckId) {
    const record = this.records.find((deck) => deck.deckId === deckId);
    if (!record) throw new Error(`保存デッキが見つかりません: ${deckId}`);
    return clone(record);
  }

  create({ deckName, cards }) {
    if (this.records.length >= MAX_DECKS) throw new Error(`保存デッキは最大${MAX_DECKS}個です`);
    const deckId = this.idFactory();
    if (this.records.some((deck) => deck.deckId === deckId)) throw new Error(`deckIdが重複しています: ${deckId}`);
    const timestamp = this.now();
    const record = this._normalizeRecord({
      deckId, deckName, cards: normalizeDeckCards(cards, deckId), qualification: 'bronze', highestReached: 'bronze', createdAt: timestamp, updatedAt: timestamp,
    });
    this.records.push(record);
    return clone(record);
  }

  rename(deckId, deckName) {
    const record = this._find(deckId);
    record.deckName = validName(deckName);
    record.updatedAt = this.now();
    return clone(record);
  }

  setRepresentativeMonster(deckId, monsterId) {
    const record = this._find(deckId);
    const definition = this.masterIndex.cards.get(monsterId);
    if (definition?.kind !== 'monster' || !record.cards.some((card) => card.masterId === monsterId)) {
      throw new Error('リーダーはこのデッキに入っているモンスターから選んでください');
    }
    record.representativeMonsterId = monsterId;
    record.updatedAt = this.now();
    return clone(record);
  }

  replaceCards(deckId, cards) {
    const record = this._find(deckId);
    const normalized = normalizeDeckCards(cards, deckId);
    const validation = validateDeck(normalized, this.masterIndex, { deckId });
    if (!validation.valid) throw new Error(`40枚を保存できません:\n${validation.errors.join('\n')}`);
    record.cards = normalized;
    record.totalPlayTp = totalPlayTp(normalized, this.masterIndex);
    record.representativeMonsterId = representativeId(normalized, this.masterIndex, record.representativeMonsterId);
    record.updatedAt = this.now();
    return clone(record);
  }

  replaceCardsAndPool(deckId, { cards, pool }) {
    const record = this._find(deckId);
    const normalized = normalizeDeckCards(cards, deckId);
    const validation = validateDeck(normalized, this.masterIndex, { deckId });
    if (!validation.valid) throw new Error(`40枚を保存できません:\n${validation.errors.join('\n')}`);
    const normalizedPool = (pool ?? []).map((card, index) => normalizeCardAppearance({
      ...clone(card),
      instanceId: card.instanceId ?? `${deckId}-pool-${String(index + 1).padStart(3, '0')}`,
      masterId: card.masterId,
      artVariantId: card.artVariantId ?? 'base',
      finish: card.finish ?? 'normal',
      origin: card.origin ?? 'core',
    })).filter((card) => this.masterIndex.cards.has(card.masterId));
    const ids = [...normalized, ...normalizedPool].map((card) => card.instanceId);
    if (new Set(ids).size !== ids.length) throw new Error('デッキ内のカード資産IDが重複しています');
    record.cards = normalized;
    record.pool = normalizedPool;
    record.totalPlayTp = totalPlayTp(normalized, this.masterIndex);
    record.representativeMonsterId = representativeId(normalized, this.masterIndex, record.representativeMonsterId);
    record.updatedAt = this.now();
    return clone(record);
  }

  recordTournamentEntry(deckId, rank) {
    const record = this._find(deckId);
    if (!TOURNAMENTS.includes(rank)) throw new Error(`Unknown tournament: ${rank}`);
    if (rankIndex(rank) > rankIndex(record.qualification)) throw new Error(`${record.deckName}には出場資格がありません`);
    if (rankIndex(rank) > rankIndex(record.highestReached)) record.highestReached = rank;
    record.updatedAt = this.now();
    return clone(record);
  }

  grantTournamentWin(deckId, rank) {
    const record = this._find(deckId);
    if (!TOURNAMENTS.includes(rank)) throw new Error(`Unknown tournament: ${rank}`);
    if (rankIndex(rank) > rankIndex(record.highestReached)) record.highestReached = rank;
    const next = TOURNAMENTS[rankIndex(rank) + 1];
    if (next && rankIndex(next) > rankIndex(record.qualification)) record.qualification = next;
    record.updatedAt = this.now();
    return clone(record);
  }

  remove(deckId) {
    const index = this.records.findIndex((deck) => deck.deckId === deckId);
    if (index < 0) throw new Error(`保存デッキが見つかりません: ${deckId}`);
    return clone(this.records.splice(index, 1)[0]);
  }

  export() { return clone(this.records); }

  _find(deckId) {
    const record = this.records.find((deck) => deck.deckId === deckId);
    if (!record) throw new Error(`保存デッキが見つかりません: ${deckId}`);
    return record;
  }
}

export { MAX_DECKS };
