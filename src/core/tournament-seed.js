function defaultRandomId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
}

export class TournamentSeedSource {
  constructor({ fixedSeed = null, now = () => Date.now(), randomId = defaultRandomId } = {}) {
    this.fixedSeed = fixedSeed == null ? null : String(fixedSeed);
    this.now = now;
    this.randomId = randomId;
    this.runNumber = 0;
    this.sessionSeed = this.fixedSeed ?? `web-${this.now().toString(36)}-${this.randomId()}`;
  }

  next() {
    this.runNumber += 1;
    if (this.fixedSeed != null) return `${this.fixedSeed}:run:${this.runNumber}`;
    return `${this.sessionSeed}:run:${this.runNumber}:${this.randomId()}`;
  }
}
