export const SURVIVAL_CHECKPOINT_PHASES = Object.freeze(['survival', 'survival-battle', 'survival-result']);

export function isSurvivalCheckpoint(checkpoint) {
  return Boolean(checkpoint?.runId && SURVIVAL_CHECKPOINT_PHASES.includes(checkpoint.phase) && checkpoint.survival);
}

export function resumableSurvivalCheckpoint(checkpoint) {
  return isSurvivalCheckpoint(checkpoint) && checkpoint.phase !== 'survival-result'
    ? checkpoint
    : isSurvivalCheckpoint(checkpoint) ? checkpoint : null;
}
