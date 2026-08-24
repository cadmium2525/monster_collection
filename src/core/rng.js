function hashSeed(seed) {
  let hash = 2166136261 >>> 0;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

export class SeededRng {
  constructor(seed = Date.now(), state = null) {
    this.seed = String(seed);
    this.state = state == null ? hashSeed(seed) : state >>> 0;
  }

  next() {
    let value = (this.state += 0x6d2b79f5) >>> 0;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min, maxInclusive) {
    if (maxInclusive < min) throw new RangeError('maxInclusive must be >= min');
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  choice(items) {
    if (!items.length) return undefined;
    return items[this.int(0, items.length - 1)];
  }

  shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.int(0, index);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  weightedChoice(items, weightFor) {
    const weighted = items.map((item) => ({ item, weight: Math.max(0, Number(weightFor(item)) || 0) }));
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return this.choice(items);
    let roll = this.next() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return weighted.at(-1)?.item;
  }

  fork(label) {
    return new SeededRng(`${this.seed}:${label}:${this.state}`);
  }

  clone() {
    return new SeededRng(this.seed, this.state);
  }

  toJSON() {
    return { seed: this.seed, state: this.state };
  }
}
