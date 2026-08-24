export class ChampionConflictError extends Error {
  constructor({ expectedVersion, actualVersion }) {
    super(`王座versionが更新されています（対戦開始時 ${expectedVersion} / 現在 ${actualVersion}）`);
    this.name = 'ChampionConflictError';
    this.code = 'champion/version-conflict';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class RepositoryUnavailableError extends Error {
  constructor(message, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RepositoryUnavailableError';
    this.code = 'repository/unavailable';
  }
}
