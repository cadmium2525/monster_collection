import { FACTION_ADVANTAGE, RULES } from './rules.js';
import { effectiveAtk, effectiveDef, lifeRatio, livingUnits } from './state.js';

export function hasNormalTrait(unit, monsterName) {
  return !unit.specialForm && unit.baseMonsterName === monsterName;
}

export function applyAtkBuff(unit, amount) {
  const adjusted = hasNormalTrait(unit, 'ピクシー') && amount > 0 ? amount + 5 : amount;
  unit.atkMod += adjusted;
  return adjusted;
}

export function applyDefBuff(unit, amount) {
  unit.defMod += amount;
  return amount;
}

export function applyAtkDebuff(unit, amount) {
  const before = effectiveAtk(unit);
  unit.atkMod -= Math.max(0, amount);
  return Math.max(0, before - effectiveAtk(unit));
}

export function applyDefDebuff(unit, amount) {
  const mitigated = hasNormalTrait(unit, 'ヘンガー') ? Math.max(0, amount - 5) : Math.max(0, amount);
  const before = effectiveDef(unit);
  unit.defMod -= mitigated;
  return Math.max(0, before - effectiveDef(unit));
}

export function resolvedMoveTp(player, unit, target, move) {
  let cost = move.tp;
  const firstMove = unit.movesUsedThisTurn === 0;

  if (move.name === 'ガッチャー' && lifeRatio(unit) <= 0.5) cost -= 1;
  if (move.name === 'ゴッドストライク' && unit.life >= unit.maxLife) cost -= 1;
  if (move.name === 'デスファイナル' && target && lifeRatio(target) <= 0.5) cost -= 1;

  if (hasNormalTrait(unit, 'メタルナー') && firstMove && move.rank <= 3) cost -= 1;
  if (hasNormalTrait(unit, 'ライガー') && firstMove) cost -= 1;
  if (!unit.specialForm && firstMove) cost -= Math.max(0, Number(unit.traitEngine?.firstMoveDiscount) || 0);
  cost -= player.effects.factionMoveDiscount[unit.faction] ?? 0;

  if (unit.specialForm === 'ラブラブセイジン' && firstMove) cost -= 1;
  cost = Math.max(1, cost);

  if (target && hasNormalTrait(target, 'ドラゴン')) cost += 1;
  if (unit.specialForm === 'クレバス') cost = Math.max(2, cost - 1);
  const surcharge = (player.effects.nextTurnMoveSurcharges ?? [])
    .find((effect) => effect.activeFromTurn <= player.turnNumber && effect.remaining > 0);
  if (surcharge) cost += Math.max(0, Number(surcharge.amount) || 0);
  return cost;
}

export function consumeMoveSurcharge(player) {
  const surcharge = (player.effects.nextTurnMoveSurcharges ?? [])
    .find((effect) => effect.activeFromTurn <= player.turnNumber && effect.remaining > 0);
  if (surcharge) surcharge.remaining = 0;
}

export function resolvedMovePower(unit, target, move) {
  if (move.power == null) return null;
  let power = move.power;
  const fullLife = unit.life >= unit.maxLife;
  const lowTarget = target && lifeRatio(target) <= 0.5;
  const lowSelf = lifeRatio(unit) <= 0.5;

  if (move.name === 'フラワービーム' && target?.statuses.parasite) power = 150;
  if (move.name === 'もっさん' && lowSelf) power = 130;
  if (move.name === '超モッチ砲' && lowSelf) power = 150;
  if (move.name === 'ゴッドアタック' && fullLife) power = 140;
  if (move.name === '神の怒り' && fullLife) power = 150;
  if (move.name === '冥王剣' && unit.statuses.knightWill) power = 150;

  if (hasNormalTrait(unit, 'ジョーカー') && lowTarget) power += 20;
  return power;
}

export function defenseIgnore(player, unit, target, move) {
  let ignore = 0;
  if (hasNormalTrait(unit, 'ウンディーネ')) ignore += 10;
  if (!unit.specialForm) ignore += Math.max(0, Number(unit.traitEngine?.defenseIgnore) || 0);
  if (move.effect.includes('追加でDEF5無視')) ignore += 5;
  if (move.effect.includes('追加でDEF10無視')) ignore += 10;
  if (move.name === 'デスゲート' && lifeRatio(target) <= 0.5) ignore += 5;
  const breederIgnore = unit.statuses.vsCreationDefIgnore;
  if (breederIgnore) {
    ignore += typeof breederIgnore === 'number'
      ? (target.faction === '創造' ? breederIgnore : 0)
      : (target.faction === '創造' ? breederIgnore.creation : breederIgnore.base);
  }
  return ignore;
}

export function combatStats(unit, target) {
  let attack = effectiveAtk(unit);
  let defense = effectiveDef(target);
  if (FACTION_ADVANTAGE[unit.faction] === target.faction) attack = Math.floor(attack * RULES.factionAdvantageMultiplier);
  if (FACTION_ADVANTAGE[target.faction] === unit.faction) defense = Math.floor(defense * RULES.factionAdvantageMultiplier);
  if (hasNormalTrait(unit, 'ゴーレム') && effectiveDef(target) >= 30) attack += 10;
  return { attack, defense };
}

export function outgoingDamageMultiplier(unit, target, move, opponent) {
  let multiplier = 1;
  const lowSelf = lifeRatio(unit) <= 0.5;
  const lowTarget = target ? lifeRatio(target) <= 0.5 : false;
  const special = unit.specialForm;

  if (unit.statuses.nextDamageBonus) multiplier *= 1 + unit.statuses.nextDamageBonus;
  if (unit.statuses.nextDamagePenalty) multiplier *= Math.max(0, 1 - unit.statuses.nextDamagePenalty);
  if (unit.statuses.temporaryTurnDamageBonus) multiplier *= 1 + unit.statuses.temporaryTurnDamageBonus;

  if (special === 'ナハトファルター' && lowSelf) multiplier *= 1.3;
  if (special === 'ハムライガー' && move.tp === 2) multiplier *= 1.25;
  if (special === 'ヴァージアハピ') multiplier *= 1.2;
  if (special === 'ガリニクス' && target && lifeRatio(target) > lifeRatio(unit)) multiplier *= 1.3;
  if (special === 'ブルードリル' && target && unit.statuses.lastAttackTargetId === target.id) {
    multiplier *= 1 + Math.min(3, unit.statuses.consecutiveAttackCount) * 0.15;
  }
  if (special === 'フレアデス' && lowTarget) multiplier *= 1.4;
  if (special === 'アンゴルモア' && move.tp >= 4) multiplier *= 1.35;
  if (special === 'タイラント' && target && effectiveAtk(unit) >= effectiveDef(target)) multiplier *= 1.3;
  if (special === 'ラプタ' && unit.movesUsedThisTurn === 0) multiplier *= 1.25;
  if (special === 'アオサギビ' && lowSelf) multiplier *= 1.2;
  if (special === 'ベニヒメソウ' && unit.statuses.benihimeCharged) multiplier *= 1.2;
  if (special === 'グレイシア' && unit.statuses.glaciaCharged) multiplier *= 1.2;
  if (special === 'ラグナロックス' && target) {
    const minimum = Math.min(...livingUnits(opponent).map((candidate) => effectiveDef(candidate)));
    if (effectiveDef(target) === minimum) multiplier *= 1.5;
  }
  return multiplier;
}

export function applyIncomingModifiers(unit, rawDamage) {
  let damage = Math.max(0, rawDamage);
  const triggers = [];
  if (unit.statuses.nextDamageReduction) {
    damage = Math.floor(damage * Math.max(0, 1 - unit.statuses.nextDamageReduction));
    unit.statuses.nextDamageReduction = 0;
    triggers.push('次回ダメージ軽減');
  }

  const normalReduction = !unit.specialForm && !unit.statuses.normalFirstIncomingUsedThisTurn
    ? Math.max(0, Math.min(0.9, Number(unit.traitEngine?.firstIncomingReduction) || 0))
    : 0;
  if (normalReduction > 0) {
    damage = Math.floor(damage * (1 - normalReduction));
    unit.statuses.normalFirstIncomingUsedThisTurn = true;
    triggers.push(unit.traitName);
  }

  if (unit.specialForm === 'ナハトファルター' && lifeRatio(unit) <= 0.5) {
    damage = Math.floor(damage * 0.8);
    triggers.push('ナハトファルター');
  }
  if (unit.specialForm === 'フューチャー' && !unit.statuses.firstIncomingUsed) {
    damage = Math.min(damage, Math.floor(unit.maxLife * 0.25));
    unit.statuses.firstIncomingUsed = true;
    triggers.push('フューチャー');
  }
  if (unit.specialForm === 'グレイシア' && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * 0.7);
    unit.statuses.firstIncomingUsed = true;
    unit.statuses.glaciaCharged = true;
    triggers.push('グレイシア');
  }
  if (unit.specialForm === 'ヨロイモッチー' && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * 0.6);
    unit.statuses.firstIncomingUsed = true;
    triggers.push('ヨロイモッチー');
  }
  if (unit.specialForm === 'アンキロックス' && damage >= unit.maxLife * 0.2) {
    damage = Math.floor(damage * 0.7);
    triggers.push('アンキロックス');
  }
  if (unit.specialForm === 'ジュラスウォール' && lifeRatio(unit) >= 0.7) {
    damage = Math.floor(damage * 0.7);
    triggers.push('ジュラスウォール');
  }
  if (unit.statuses.gallionGuard) {
    damage = Math.floor(damage * 0.7);
    triggers.push('ガリオン');
  }
  return { damage, triggers };
}

export function updateConsecutiveTarget(unit, targetId) {
  if (unit.statuses.lastAttackTargetId === targetId) unit.statuses.consecutiveAttackCount += 1;
  else unit.statuses.consecutiveAttackCount = 1;
  unit.statuses.lastAttackTargetId = targetId;
}
