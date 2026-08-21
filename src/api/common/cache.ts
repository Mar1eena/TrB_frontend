import { wrapRpcError } from "./errors";

export type CacheOptions = {
  fresh?: boolean;
  ttlMs?: number;
};

const DEFAULT_CACHE_TTL_MS = 2000;

export class ApiCache {
  private cache = new Map<string, { at: number; data: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  private defaultTtl: number;

  constructor(defaultTtl = DEFAULT_CACHE_TTL_MS) {
    this.defaultTtl = defaultTtl;
  }

  async read<T>(key: string, fn: () => Promise<T>, opts?: CacheOptions): Promise<T> {
    const ttl = opts?.ttlMs ?? this.defaultTtl;
    if (!opts?.fresh && ttl > 0) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.at < ttl) {
        return cached.data as T;
      }
      const pending = this.inflight.get(key);
      if (pending) {
        return pending as Promise<T>;
      }
    }

    const run = (async () => {
      try {
        const data = await fn();
        if (ttl > 0) {
          this.cache.set(key, { at: Date.now(), data });
        }
        return data;
      } catch (err) {
        throw wrapRpcError(err);
      }
    })();

    this.inflight.set(key, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(key);
    }
  }

  async write<T>(fn: () => Promise<T>): Promise<T> {
    this.clear();
    try {
      const data = await fn();
      this.clear();
      return data;
    } catch (err) {
      throw wrapRpcError(err);
    }
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const globalApiCache = new ApiCache();
