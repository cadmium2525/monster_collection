function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function signed(value) {
  return `${value > 0 ? '+' : ''}${value}`;
}

function percent(value) {
  return `${Math.round(number(value) * 100)}%`;
}

export function unitLifePresentation(unit) {
  const max = Math.max(0, number(unit?.maxLife));
  const current = Math.max(0, number(unit?.life));
  const ratio = max > 0 ? current / max : 0;
  return {
    current,
    max,
    ratio,
    percentage: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    low: max > 0 && current * 2 <= max,
  };
}

export function unitStatusEntries(unit) {
  if (!unit) return [];
  const entries = [];
  const statuses = unit.statuses ?? {};
  const add = (key, tone, icon, label, detail) => entries.push({ key, tone, icon, label, detail });
  const addStat = (key, stat, amount, detail) => {
    const value = number(amount);
    if (!value) return;
    add(key, value > 0 ? 'positive' : 'negative', value > 0 ? '▲' : '▼', `${stat} ${signed(value)}`, detail);
  };

  addStat('atk-mod', 'ATK', unit.atkMod, 'この試合中');
  addStat('def-mod', 'DEF', unit.defMod, 'この試合中');
  addStat('temporary-atk', 'ATK', unit.temporaryAtk, 'このターン中');
  addStat('temporary-def', 'DEF', unit.temporaryDef, 'このターン中');
  for (const [index, buff] of (unit.timedAtkBuffs ?? []).entries()) {
    addStat(`timed-atk-${index}`, 'ATK', buff.amount, `残り${Math.max(0, number(buff.remaining))}ターン`);
  }
  for (const [index, buff] of (unit.timedDefBuffs ?? []).entries()) {
    addStat(`timed-def-${index}`, 'DEF', buff.amount, `残り${Math.max(0, number(buff.remaining))}ターン`);
  }

  if (number(statuses.nextDamageBonus) > 0) add('next-damage-bonus', 'positive', '▲', `次の技ダメージ +${percent(statuses.nextDamageBonus)}`, '技を使うと解除');
  if (number(statuses.nextDamagePenalty) > 0) add('next-damage-penalty', 'negative', '▼', `次の技ダメージ -${percent(statuses.nextDamagePenalty)}`, '技を使うと解除');
  if (number(statuses.nextDamageReduction) > 0) add('next-damage-reduction', 'positive', '盾', `次の被ダメージ -${percent(statuses.nextDamageReduction)}`, '攻撃を受けると解除');
  if (statuses.vsCreationDefIgnore) {
    const base = Math.max(0, number(statuses.vsCreationDefIgnore.base));
    const creation = Math.max(base, number(statuses.vsCreationDefIgnore.creation));
    add('vs-creation-def-ignore', 'positive', '貫', `相手DEFを${base}無視`, `神造には${creation}無視・この試合中`);
  }
  if (statuses.evadeNext) add('evade-next', 'positive', '避', '次の攻撃を回避', '攻撃を受けると解除');
  if (unit.stunnedThisTurn) add('stunned', 'negative', '止', '行動不能', 'このターン中');
  if (number(statuses.stunOnNextTurn) > 0) add('stun-next', 'negative', '止', '次ターン行動不能', `${number(statuses.stunOnNextTurn)}回分`);
  if (statuses.parasite) add('parasite', 'negative', '寄', '寄生', 'ターン開始時にLIFE5吸収');
  if (statuses.knightWill) add('knight-will', 'special', '意', '騎士の意地', '対応技の効果が強化');
  if (number(statuses.temporaryTurnDamageBonus) > 0) add('turn-damage-bonus', 'positive', '▲', `このターンの与ダメージ +${percent(statuses.temporaryTurnDamageBonus)}`, 'ターン終了まで');
  if (number(statuses.hamKillBonus) > 0) add('ham-kill-bonus', 'positive', '▲', `撃破強化 ATK +${number(statuses.hamKillBonus)}`, 'この試合中');
  if (statuses.glaciaCharged) add('glacia-charged', 'special', '氷', '氷刃充填', '次の技ダメージが増加');
  if (statuses.gallionGuard) add('gallion-guard', 'positive', '盾', '連撃防御', 'このターン中の被ダメージ軽減');
  if (statuses.benihimeCharged) add('benihime-charged', 'special', '花', '生命充填', '次の技ダメージが増加');
  if (number(statuses.recoilOnNextAttack) > 0) add('recoil', 'negative', '反', `次の攻撃後にLIFE${number(statuses.recoilOnNextAttack)}減少`, '技を使うと解除');
  if (number(statuses.overclockPendingDefPenalty) > 0) add('overclock-penalty', 'negative', '▼', `次ターンDEF -${number(statuses.overclockPendingDefPenalty)}`, '次ターン開始時に適用');
  if (number(statuses.autoRepairRemaining) > 0) add('auto-repair', 'positive', '修', '自動修復', `残り${number(statuses.autoRepairRemaining)}ターン`);
  if (statuses.swapAtkDef) add('swap-atk-def', 'special', '換', 'ATK・DEF入替', 'このターン中');
  if (statuses.spareParts) add('spare-parts', 'positive', '命', '予備パーツ', '撃破時にLIFE1で耐える');
  if (number(statuses.echoNext) > 0) add('echo-next', 'positive', '響', `次の攻撃に残響 ${percent(statuses.echoNext)}`, '技を使うと解除');
  if (statuses.returnToHandOnDefeat) add('return-on-defeat', 'positive', '帰', '霊界帰還', '撃破時に手札へ戻る');
  if (statuses.incomingFlatDamage) {
    const amount = Math.max(0, number(statuses.incomingFlatDamage.amount));
    const remaining = Math.max(0, number(statuses.incomingFlatDamage.remaining));
    add('incoming-flat-damage', 'negative', '印', `被ダメージ +${amount}`, `残り${remaining}回`);
  }
  if (number(statuses.tpOnNextKill) > 0) add('tp-on-kill', 'positive', 'TP', `次の撃破でTP +${number(statuses.tpOnNextKill)}`, '撃破すると解除');
  if (statuses.predationEvolution) add('predation-evolution', 'positive', '喰', '捕食進化', '撃破時にATK・DEF上昇');
  if (statuses.phantomExtraActionPending) add('phantom-extra-action', 'positive', '時', '次ターン行動権 +1', '次の自ターン開始時');
  if (number(statuses.specialCounters?.gaiaRetaliation) > 0) {
    add('gaia-retaliation', 'positive', '牙', `反撃充填 +${percent(statuses.specialCounters.gaiaRetaliation)}`, '次の技を使うと解除');
  }
  if (number(statuses.specialCounters?.obeliskCharge) > 0) {
    add('obelisk-charge', 'positive', '碑', `反射蓄積 +${number(statuses.specialCounters.obeliskCharge)}`, '次の技ダメージへ加算');
  }

  return entries;
}

export function unitStatusGroups(unit) {
  const entries = unitStatusEntries(unit);
  return ['positive', 'negative', 'special'].map((tone) => {
    const matching = entries.filter((entry) => entry.tone === tone);
    return matching.length ? {
      tone,
      icon: tone === 'positive' ? '▲' : tone === 'negative' ? '▼' : '◆',
      count: matching.length,
      label: matching.map((entry) => entry.label).join('、'),
    } : null;
  }).filter(Boolean);
}

export function lowLifeTargetEffects(source, target, move) {
  if (!source || !target || !move || !unitLifePresentation(target).low) return [];
  const effects = [];
  if (!source.specialForm && source.baseMonsterName === 'ジョーカー') {
    effects.push('技威力+20');
    if (move.id === 'move-084') effects.push('消費TP-1');
    if (move.id === 'move-090') effects.push('DEFを5低く扱う');
  }
  if (source.specialForm === 'インフェルノジャッジ') effects.push('与ダメージ+40%');
  return effects;
}
