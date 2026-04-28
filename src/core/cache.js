class Cache {
  constructor() {
    this._store = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  invalidate(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    for (const key of this._store.keys()) {
      if (regex.test(key)) {
        this._store.delete(key);
      }
    }
  }

  stats() {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._store.size,
    };
  }
}

module.exports = { Cache };
