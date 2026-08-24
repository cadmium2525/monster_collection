export const CHAMPION_CONFLICT_POLICY = Object.freeze({
  id: 'strict-version-rechallenge',
  description: '対戦開始後に王座versionが変わった場合、旧王者スナップショットへの勝利では王座を書き換えず、現王者へ再挑戦する。',
  allowOverwriteAfterConflict: false,
});
