/**
 * KV caching helper for Aegis Terminal.
 * Wraps KVNamespace with typed get/set + TTL.
 */

export interface CacheOptions {
  ttl?: number; // seconds, default 300 (5 min)
}

export class Cache {
  private kv: KVNamespace;
  private defaultTTL: number;

  constructor(kv: KVNamespace, defaultTTL = 300) {
    this.kv = kv;
    this.defaultTTL = defaultTTL;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key, 'json');
    return raw as T | null;
  }

  async set<T>(key: string, value: T, opts?: CacheOptions): Promise<void> {
    const ttl = opts?.ttl ?? this.defaultTTL;
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
  }

  /**
   * Get from cache, or execute fn and cache result.
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, opts?: CacheOptions): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, opts);
    return value;
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
