// Game-embedded effects from 効果音ラボ. See assets/audio/se/CREDITS.md.
// Relative gains are multiplied by the existing master gain and user SE volume.
export const SOUND_CUES = Object.freeze({
  confirm: { file: 'decision3', volume: 0.55 },
  cancel: { file: 'cancel8', volume: 0.25 },
  summon: { file: 'magic-worp1', volume: 0.8 },
  fusion: { file: 'magic-circle1', volume: 0.65 },
  awaken: { file: 'aura2', volume: 0.85 },
  packOpen: { file: 'magic-worp1', volume: 0.8 },
  rareReveal: { file: 'kira1', volume: 0.8 },
  reward: { file: 'success1', volume: 0.7 },
  victory: { file: 'trumpet1', volume: 0.75 },
  defeat: { file: 'shock1', volume: 0.65 },
});

export function playSoundCue(output, name) {
  const cue = SOUND_CUES[name];
  if (!cue || !output) return;
  try {
    const pending = output(`./assets/audio/se/${cue.file}.mp3`, { volume: cue.volume });
    pending?.catch?.(() => {});
  } catch {
    // Audio failure must never interrupt an action or a reward transaction.
  }
}

export function resultSoundCue(winnerId, playerId) {
  return winnerId == null ? null : winnerId === playerId ? 'victory' : 'defeat';
}

export function installUiSoundFeedback(documentRef, output, screen) {
  let lastPlayed = -Infinity;
  const click = (event) => {
    const button = event.target?.closest?.('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    // Battle and pack opening have their own precisely timed presentation sounds.
    if (['battle', 'arena-battle', 'survival-battle', 'pack-opening', 'admin-pack-preview'].includes(screen())) return;
    const now = Date.now();
    if (now - lastPlayed < 120) return;
    lastPlayed = now;
    const label = button.getAttribute('aria-label') || button.textContent || '';
    playSoundCue(output, /戻る|閉じる|キャンセル|^×$/.test(label.trim()) ? 'cancel' : 'confirm');
  };
  documentRef.addEventListener('click', click, true);
  return () => documentRef.removeEventListener('click', click, true);
}
