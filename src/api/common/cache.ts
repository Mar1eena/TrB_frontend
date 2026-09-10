import { wrapRpcError } from "./errors";
import { queryClient } from "./queryClient";

export type CacheOptions = {
  fresh?: boolean;
  ttlMs?: number;
};

const DEFAULT_CACHE_TTL_MS = 2000;

/**
 * Тонкая надстройка над общим TanStack QueryClient для api-слоя (вне React).
 *
 * - `read` = `queryClient.fetchQuery` (TTL → staleTime, дедуп in-flight и кеш —
 *   встроенные в react-query).
 * - `write` инвалидирует кеш вокруг мутации.
 * - Ключ строки превращается в queryKey разбиением по «:», чтобы префиксная
 *   инвалидация (`invalidate("nats:")`) работала через частичное совпадение ключа.
 */
export class ApiCache {
  private defaultTtl: number;
  private prefix: string;

  constructor(defaultTtl = DEFAULT_CACHE_TTL_MS, namespace = "api") {
    this.defaultTtl = defaultTtl;
    this.prefix = namespace;
  }

  private toKey(key: string): unknown[] {
    return [this.prefix, ...key.split(":")];
  }

  async read<T>(key: string, fn: () => Promise<T>, opts?: CacheOptions): Promise<T> {
    const ttl = opts?.ttlMs ?? this.defaultTtl;
    const queryKey = this.toKey(key);
    if (opts?.fresh) {
      queryClient.removeQueries({ queryKey, exact: true });
    }
    try {
      return await queryClient.fetchQuery({
        queryKey,
        queryFn: fn,
        staleTime: opts?.fresh ? 0 : ttl,
        gcTime: Math.max(ttl, DEFAULT_CACHE_TTL_MS),
      });
    } catch (err) {
      throw wrapRpcError(err);
    }
  }

  async write<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const data = await fn();
      await queryClient.invalidateQueries({ queryKey: [this.prefix] });
      return data;
    } catch (err) {
      throw wrapRpcError(err);
    }
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      void queryClient.invalidateQueries({ queryKey: [this.prefix] });
      return;
    }
    const parts = this.toKey(keyPrefix);
    void queryClient.invalidateQueries({
      predicate: (query) =>
        parts.every((part, i) => query.queryKey[i] === part),
    });
  }

  clear(): void {
    queryClient.removeQueries({ queryKey: [this.prefix] });
  }
}

export const globalApiCache = new ApiCache();
