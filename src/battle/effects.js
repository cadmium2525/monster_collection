import { FACTION_ADVANTAGE, RULES } from './rules.js';
import { effectiveAtk, effectiveDef, lifeRatio, livingUnits } from './state.js';

export function hasNormalTrait(unit, monsterName) {
  return !unit.specialForm && unit.baseMonsterName === monsterName;
}

export function hasAwakening(unit, abilityId) {
  return Boolean(unit?.awakened && unit.awakeningAbilityId === abilityId);
}

export function applyAtkBuff(unit, amount) {
  let adjusted = hasNormalTrait(unit, 'ピクシー') && amount > 0 ? amount + 5 : amount;
  if (amount > 0 && hasAwakening(unit, 'base:ピクシー') && !unit.statuses.awakening.turnFlags?.pixieBuff) {
    adjusted += 5;
    unit.statuses.awakening.turnFlags ??= {};
    unit.statuses.awakening.turnFlags.pixieBuff = true;
    unit.statuses.nextDamageBonus = Math.max(unit.statuses.nextDamageBonus, 0.15);
  }
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
  const mitigated = hasAwakening(unit, 'base:ギアセンチネル')
    ? 0
    : hasNormalTrait(unit, 'ギアセンチネル') ? Math.max(0, amount - 5) : Math.max(0, amount);
  const before = effectiveDef(unit);
  unit.defMod -= mitigated;
  return Math.max(0, before - effectiveDef(unit));
}

export function resolvedMoveTp(player, unit, target, move, opponent = null) {
  let cost = move.tp;
  const firstMove = unit.movesUsedThisTurn === 0;

  if (move.id === 'move-011' && lifeRatio(unit) <= 0.5) cost -= 1;
  if (move.id === 'move-158' && unit.life >= unit.maxLife) cost -= 1;
  if (move.id === 'move-084' && target && lifeRatio(target) <= 0.5) cost -= 1;

  if (hasNormalTrait(unit, 'アストラノイド') && firstMove && move.rank <= 3) cost -= 1;
  if (hasNormalTrait(unit, 'ボルトウルフ') && firstMove) cost -= 1;
  if (hasAwakening(unit, 'base:アストラノイド') && firstMove && move.rank >= 4) cost -= 1;
  if (hasAwakening(unit, 'base:クロノギア') && unit.statuses.awakening.pending) cost -= 1;
  if (hasAwakening(unit, 'base:カスミヨ') && unit.statuses.awakening.pending) cost -= 1;
  if (hasAwakening(unit, 'base:レオネア') && firstMove) cost -= 1;
  if (!unit.specialForm && firstMove) cost -= Math.max(0, Number(unit.traitEngine?.firstMoveDiscount) || 0);
  if (!unit.specialForm && lifeRatio(unit) <= 0.5) {
    cost -= Math.max(0, Number(unit.traitEngine?.lowLifeMoveDiscount) || 0);
  }
  cost -= player.effects.factionMoveDiscount[unit.faction] ?? 0;

  if (unit.specialForm === 'コズミックミューズ' && firstMove) cost -= 1;
  if (['アルケノクロック', 'ソルフェニキア', 'アストラレイ', 'フェアリアーク', 'アストラカスミヨ', 'ルナリリヴェル'].includes(unit.specialForm) && firstMove) cost -= 1;
  cost = Math.max(1, cost);

  if (hasAwakening(unit, 'fusion:ゴウライウルフ') && move.tp === 2) cost = 1;
  if (hasAwakening(unit, 'fusion:アルカノレックス') && target && lifeRatio(target) > lifeRatio(unit)) cost = Math.max(1, cost - 1);
  if (hasAwakening(unit, 'fusion:アンゴルモア') && move.tp >= 4) cost = Math.max(3, cost - 1);
  if (hasAwakening(unit, 'fusion:イグニギア') && firstMove) cost = Math.max(1, cost - 1);
  if (hasAwakening(unit, 'fusion:オブシディアーク') && target && opponent) {
    const minimum = Math.min(...livingUnits(opponent).map((candidate) => effectiveDef(candidate)));
    if (effectiveDef(target) === minimum && !unit.statuses.awakening.turnFlags?.obsidiark) cost = Math.max(1, cost - 1);
  }
  if (hasAwakening(unit, 'fusion:クレバス') && firstMove) cost = Math.max(1, cost - 1);
  if (hasAwakening(unit, 'fusion:エクリシエル') && unit.statuses.awakening.pending) cost = Math.max(1, cost - 1);

  if (target && hasNormalTrait(target, 'ドラゴン')) cost += hasAwakening(target, 'base:ドラゴン') ? 2 : 1;
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
  if (move.id === 'move-014' && lowSelf) power = 130;
  if (move.id === 'move-018' && lowSelf) power = 150;
  if (move.id === 'move-156' && fullLife) power = 140;
  if (move.id === 'move-159' && fullLife) power = 150;
  if (move.id === 'move-039' && unit.statuses.knightWill) power = 150;

  if (hasNormalTrait(unit, 'ジョーカー') && lowTarget) power += 20;
  return power;
}

export function defenseIgnore(player, unit, target, move, opponent = null) {
  let ignore = 0;
  if (hasNormalTrait(unit, 'ウンディーネ')) ignore += 10;
  if (!unit.specialForm) ignore += Math.max(0, Number(unit.traitEngine?.defenseIgnore) || 0);
  if (move.effect.includes('追加でDEF5無視')) ignore += 5;
  if (move.effect.includes('追加でDEF10無視')) ignore += 10;
  if (move.id === 'move-090' && lifeRatio(target) <= 0.5) ignore += 5;
  if (['ネビュラミア', 'アストラレイ'].includes(unit.specialForm) && unit.movesUsedThisTurn === 0) ignore += 10;
  if (['アビスヴァルキア', 'アストラカスミヨ'].includes(unit.specialForm) && unit.movesUsedThisTurn === 0) ignore += 8;
  if (hasAwakening(unit, 'base:ウンディーネ') && unit.movesUsedThisTurn === 0) ignore += 10;
  if (hasAwakening(unit, 'base:ジョーカー') && lifeRatio(target) <= 0.5) ignore += 10;
  if (hasAwakening(unit, 'base:ミストレイ') && unit.movesUsedThisTurn === 0) ignore += 10;
  if (hasAwakening(unit, 'base:レオネア') && unit.movesUsedThisTurn === 0) ignore += 8;
  if (hasAwakening(unit, 'base:アークヴァルキア') && unit.statuses.awakening.pending) ignore += 8;
  if (hasAwakening(unit, 'fusion:アルカノレックス') && lifeRatio(target) > lifeRatio(unit)) ignore += 5;
  if (hasAwakening(unit, 'fusion:アンゴルモア') && move.tp >= 4) ignore += 5;
  if (hasAwakening(unit, 'fusion:コズミックミューズ') && unit.movesUsedThisTurn === 0) ignore += 5;
  if (hasAwakening(unit, 'fusion:クリムゾンフローラ') && unit.statuses.benihimeCharged) ignore += 8;
  if (hasAwakening(unit, 'fusion:オブシディアーク') && opponent && !unit.statuses.awakening.turnFlags?.obsidiark) {
    const minimum = Math.min(...livingUnits(opponent).map((candidate) => effectiveDef(candidate)));
    if (effectiveDef(target) === minimum) ignore += 5;
  }
  if (hasAwakening(unit, 'fusion:ノクスオラクル') && unit.statuses.awakening.pending && lifeRatio(unit) > 0.5) ignore += 8;
  if (hasAwakening(unit, 'fusion:ノクスレオネア') && lifeRatio(unit) <= 0.5 && unit.movesUsedThisTurn === 0) ignore += 8;
  const breederIgnore = unit.statuses.vsCreationDefIgnore;
  if (breederIgnore) {
    ignore += typeof breederIgnore === 'number'
      ? (target.faction === '神造' ? breederIgnore : 0)
      : (target.faction === '神造' ? breederIgnore.creation : breederIgnore.base);
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
  if (!special && unit.movesUsedThisTurn === 0) {
    multiplier *= 1 + Math.max(0, Number(unit.traitEngine?.firstMoveDamageBonus) || 0);
  }

  if (special === 'ルナモルフォ' && lowSelf) multiplier *= 1.3;
  if (special === 'ゴウライウルフ' && move.tp === 2) multiplier *= 1.25;
  if (special === 'フェイグラップラー') multiplier *= 1.2;
  if (special === 'アルカノレックス' && target && lifeRatio(target) > lifeRatio(unit)) multiplier *= 1.3;
  if (special === 'アズールドリル' && target && unit.statuses.lastAttackTargetId === target.id) {
    multiplier *= 1 + Math.min(hasAwakening(unit, 'fusion:アズールドリル') ? 4 : 3, unit.statuses.consecutiveAttackCount) * 0.15;
  }
  if (special === 'インフェルノジャッジ' && lowTarget) multiplier *= 1.4;
  if (special === 'アンゴルモア' && move.tp >= 4) multiplier *= 1.35;
  if (special === 'タイラント' && target && effectiveAtk(unit) >= effectiveDef(target)) multiplier *= 1.3;
  if (special === 'イグニギア' && unit.movesUsedThisTurn === 0) multiplier *= 1.25;
  if (special === 'アオサギビ' && lowSelf) multiplier *= 1.2;
  if (special === 'クリムゾンフローラ' && unit.statuses.benihimeCharged) multiplier *= 1.2;
  if (special === 'フロストヴァンガード' && unit.statuses.glaciaCharged) multiplier *= 1.2;
  if (special === 'オブシディアーク' && target) {
    const minimum = Math.min(...livingUnits(opponent).map((candidate) => effectiveDef(candidate)));
    if (effectiveDef(target) === minimum) multiplier *= 1.5;
  }
  if (special === 'エクリプスレイ' && lowSelf) multiplier *= 1.25;
  if (special === 'フェンリルノクス' && lowSelf) multiplier *= 1.25;
  if (special === 'ガイアヴォルフ') multiplier *= 1 + Math.min(0.3, unit.statuses.specialCounters.gaiaRetaliation ?? 0);
  if (special === 'ボルトセラフィア' && unit.statuses.specialCounters.boltSeraphCharge) multiplier *= 1.15;
  if (special === 'ルナリリヴェル' && lowSelf) multiplier *= 1.2;
  if (special === 'ノクスレオネア' && lowSelf) multiplier *= 1.2;
  if (hasAwakening(unit, 'base:アストラノイド') && unit.movesUsedThisTurn === 0 && move.rank >= 4) multiplier *= 1.15;
  if (hasAwakening(unit, 'base:アルカナロード') && unit.statuses.awakening.pending) multiplier *= 1.2;
  if (hasAwakening(unit, 'base:ボルトウルフ') && unit.movesUsedThisTurn === 0) multiplier *= 1.15;
  if (hasAwakening(unit, 'base:デュラハン') && unit.statuses.knightWill) multiplier *= 1.15;
  if (hasAwakening(unit, 'base:クロノギア') && unit.statuses.awakening.pending) multiplier *= 1.15;
  if (hasAwakening(unit, 'base:ノクティス') && lowSelf) multiplier *= 1.2;
  if (hasAwakening(unit, 'base:ヴォルファング') && unit.statuses.awakening.pending) multiplier *= 1.2;
  if (hasAwakening(unit, 'base:アークヴァルキア') && unit.statuses.awakening.pending) multiplier *= 1.1;
  if (hasAwakening(unit, 'fusion:ガルーダ') && unit.statuses.awakening.pending) multiplier *= 1.2;
  if (hasAwakening(unit, 'fusion:フロストヴァンガード') && unit.statuses.glaciaCharged) multiplier *= 1.0833333333;
  if (hasAwakening(unit, 'fusion:オブシディアンコング')
    && (unit.statuses.specialCounters.darkHamMoveDef ?? 0) + (unit.statuses.specialCounters.darkHamDef ?? 0) >= 16) multiplier *= 1.2;
  if (hasAwakening(unit, 'fusion:レックスメンヒル') && lifeRatio(unit) >= 0.7 && unit.movesUsedThisTurn === 0) multiplier *= 1.2;
  if (hasAwakening(unit, 'fusion:インフェルノジャッジ') && target && lifeRatio(target) <= 0.25) multiplier *= 1.1428571429;
  if (hasAwakening(unit, 'fusion:花葬ラビリス') && unit.statuses.awakening.pending) multiplier *= 1.15;
  if (hasAwakening(unit, 'fusion:コズミックミューズ') && unit.movesUsedThisTurn === 0) multiplier *= 1.15;
  if (hasAwakening(unit, 'fusion:ユーマ')) multiplier *= 1 + Math.min(5, unit.statuses.specialCounters.yumaStacks ?? 0) * 0.04;
  if (hasAwakening(unit, 'fusion:アイギスルミラビ') && unit.statuses.awakening.pending) multiplier *= 1.2;
  if (hasAwakening(unit, 'fusion:ルミギア・オクト') && unit.statuses.awakening.charge > 0) multiplier *= 1 + unit.statuses.awakening.charge;
  if (hasAwakening(unit, 'fusion:シャドウリーフ') && unit.statuses.awakening.charge > 0) multiplier *= 1 + unit.statuses.awakening.charge;
  if (hasAwakening(unit, 'fusion:クレバス') && unit.movesUsedThisTurn === 0) multiplier *= 1.15;
  if (hasAwakening(unit, 'fusion:ソルフェニキア') && unit.statuses.awakening.pending) multiplier *= 1.2;
  if (hasAwakening(unit, 'fusion:アストラレイ') && unit.movesUsedThisTurn === 0) multiplier *= 1.15;
  if (hasAwakening(unit, 'fusion:エクリプスレイ') && lowSelf) multiplier *= 1.04;
  if (hasAwakening(unit, 'fusion:ノクスオラクル') && lowSelf && unit.statuses.awakening.pending) multiplier *= 1.1;
  if (hasAwakening(unit, 'fusion:ガイアヴォルフ')) {
    const current = Math.min(0.4, unit.statuses.specialCounters.gaiaRetaliation ?? 0);
    if (current > 0) multiplier *= (1 + current) / (1 + Math.min(0.3, current));
  }
  if (hasAwakening(unit, 'fusion:アビスヴァルキア') && unit.movesUsedThisTurn === 0) multiplier *= 1.15;
  if (hasAwakening(unit, 'fusion:ボルトセラフィア') && unit.statuses.specialCounters.boltSeraphCharge) multiplier *= 1.0869565217;
  if (hasAwakening(unit, 'fusion:アストラカスミヨ') && unit.movesUsedThisTurn === 0) multiplier *= 1.15;
  if (hasAwakening(unit, 'fusion:ノクスレオネア') && !lowSelf && unit.statuses.awakening.pending) multiplier *= 1.15;
  return multiplier;
}

export function specialFlatDamageBonus(unit) {
  if (unit.awakened && ['base:ゴーレム', 'fusion:フューチャー', 'fusion:バスティオンレックス'].includes(unit.awakeningAbilityId)) {
    return Math.max(0, Number(unit.statuses.awakening.charge) || 0);
  }
  if (unit.specialForm === 'オベリスクグラトン') {
    const cap = hasAwakening(unit, 'fusion:オベリスクグラトン') ? 25 : 15;
    return Math.max(0, Math.min(cap, Number(unit.statuses.specialCounters.obeliskCharge) || 0));
  }
  if (unit.specialForm === 'ガイアミメシア') {
    const cap = hasAwakening(unit, 'fusion:ガイアミメシア') ? 20 : 10;
    return Math.max(0, Math.min(cap, Number(unit.statuses.specialCounters.gaiaMimesiaCharge) || 0));
  }
  return 0;
}

export function applyIncomingModifiers(unit, rawDamage) {
  let damage = Math.max(0, rawDamage);
  const triggers = [];
  if (unit.statuses.awakening?.barrier > 0) {
    const blocked = Math.min(damage, unit.statuses.awakening.barrier);
    damage -= blocked;
    unit.statuses.awakening.barrier -= blocked;
    triggers.push(`覚醒障壁-${blocked}`);
  }
  if (unit.statuses.nextDamageReduction) {
    damage = Math.floor(damage * Math.max(0, 1 - unit.statuses.nextDamageReduction));
    unit.statuses.nextDamageReduction = 0;
    triggers.push('次回ダメージ軽減');
    if (hasAwakening(unit, 'fusion:アルケノクロック')) unit.statuses.awakening.tpNextTurn = true;
  }

  const normalReduction = !unit.specialForm && !unit.statuses.normalFirstIncomingUsedThisTurn
    ? Math.max(0, Math.min(0.9, Number(unit.traitEngine?.firstIncomingReduction) || 0))
    : 0;
  if (normalReduction > 0) {
    damage = Math.floor(damage * (1 - normalReduction));
    unit.statuses.normalFirstIncomingUsedThisTurn = true;
    triggers.push(unit.traitName);
    if (hasAwakening(unit, 'base:クロノギア')) unit.statuses.awakening.pending = true;
    if (hasAwakening(unit, 'base:アークヴァルキア')) unit.statuses.awakening.pending = true;
  }

  if (unit.specialForm === 'ルナモルフォ' && lifeRatio(unit) <= 0.5) {
    damage = Math.floor(damage * 0.8);
    triggers.push('ルナモルフォ');
  }
  if (unit.specialForm === 'フューチャー' && !unit.statuses.firstIncomingUsed) {
    const beforeCap = damage;
    damage = Math.min(damage, Math.floor(unit.maxLife * 0.25));
    unit.statuses.firstIncomingUsed = true;
    triggers.push('フューチャー');
    if (hasAwakening(unit, 'fusion:フューチャー')) unit.statuses.awakening.charge = Math.min(10, Math.max(0, beforeCap - damage));
  }
  if (unit.specialForm === 'フロストヴァンガード' && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * 0.7);
    unit.statuses.firstIncomingUsed = true;
    unit.statuses.glaciaCharged = true;
    triggers.push('フロストヴァンガード');
  }
  if (unit.specialForm === 'アイギスルミラビ' && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * 0.6);
    unit.statuses.firstIncomingUsed = true;
    triggers.push('アイギスルミラビ');
    if (hasAwakening(unit, 'fusion:アイギスルミラビ')) unit.statuses.awakening.pending = true;
  }
  if (unit.specialForm === 'バスティオンレックス' && damage >= unit.maxLife * 0.2) {
    const beforeReduction = damage;
    damage = Math.floor(damage * 0.7);
    triggers.push('バスティオンレックス');
    if (hasAwakening(unit, 'fusion:バスティオンレックス')) {
      unit.statuses.awakening.charge = Math.min(12, beforeReduction - damage);
    }
  }
  if (unit.specialForm === 'レックスメンヒル' && lifeRatio(unit) >= 0.7) {
    damage = Math.floor(damage * 0.7);
    triggers.push('レックスメンヒル');
  }
  if (unit.specialForm === 'ファントムギア' && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * 0.75);
    unit.statuses.firstIncomingUsed = true;
    unit.statuses.phantomReducedThisHit = true;
    triggers.push('ファントムギア');
  }
  if (unit.specialForm === 'エクリプスレイ' && lifeRatio(unit) > 0.5) {
    damage = Math.floor(damage * (hasAwakening(unit, 'fusion:エクリプスレイ') ? 0.75 : 0.8));
    triggers.push('エクリプスレイ');
  }
  if (unit.specialForm === 'オベリスクグラトン' && damage >= 20) {
    const awakened = hasAwakening(unit, 'fusion:オベリスクグラトン');
    const reduced = Math.floor(damage * (awakened ? 0.7 : 0.75));
    const prevented = Math.max(0, damage - reduced);
    damage = reduced;
    unit.statuses.specialCounters.obeliskCharge = Math.min(awakened ? 25 : 15,
      (unit.statuses.specialCounters.obeliskCharge ?? 0) + prevented);
    triggers.push(`オベリスクグラトン（蓄積${prevented}）`);
  }
  if (unit.specialForm === 'ボルトセラフィア' && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * (hasAwakening(unit, 'fusion:ボルトセラフィア') ? 0.7 : 0.75));
    unit.statuses.firstIncomingUsed = true;
    unit.statuses.specialCounters.boltSeraphCharge = true;
    triggers.push('ボルトセラフィア');
  }
  if (unit.specialForm === 'ノクスレオネア' && lifeRatio(unit) > 0.5 && !unit.statuses.firstIncomingUsed) {
    damage = Math.floor(damage * 0.8);
    unit.statuses.firstIncomingUsed = true;
    triggers.push('ノクスレオネア');
    if (hasAwakening(unit, 'fusion:ノクスレオネア')) unit.statuses.awakening.pending = true;
  }
  if (unit.specialForm === 'ガイアミメシア' && damage >= 20) {
    const awakened = hasAwakening(unit, 'fusion:ガイアミメシア');
    const reduced = Math.floor(damage * (awakened ? 0.75 : 0.8));
    const prevented = Math.max(0, damage - reduced);
    damage = reduced;
    unit.statuses.specialCounters.gaiaMimesiaCharge = Math.min(awakened ? 20 : 10,
      (unit.statuses.specialCounters.gaiaMimesiaCharge ?? 0) + prevented);
    triggers.push(`ガイアミメシア（蓄積${prevented}）`);
  }
  if (unit.statuses.gallionGuard) {
    damage = Math.floor(damage * 0.7);
    triggers.push('マスクドヴァジュラ');
  }
  if (hasAwakening(unit, 'base:モノリス') && unit.statuses.awakening.redirecting
    && !unit.statuses.awakening.turnFlags?.monolith) {
    damage = Math.floor(damage * 0.75);
    unit.statuses.awakening.turnFlags ??= {};
    unit.statuses.awakening.turnFlags.monolith = true;
    triggers.push('不落の主核');
  }
  unit.statuses.awakening.redirecting = false;
  return { damage, triggers };
}

export function updateConsecutiveTarget(unit, targetId) {
  if (unit.statuses.lastAttackTargetId === targetId) unit.statuses.consecutiveAttackCount += 1;
  else unit.statuses.consecutiveAttackCount = 1;
  unit.statuses.lastAttackTargetId = targetId;
}
