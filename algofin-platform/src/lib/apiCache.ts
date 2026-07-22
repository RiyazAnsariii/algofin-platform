// src/lib/apiCache.ts
// Production-grade in-memory API cache & request deduplicator.
// Prevents redundant network calls when navigating between pages or rendering multi-component layouts.

import api from "./api";

interface CacheEntry<T> {
  data?: T;
  expiresAt: number;
  promise?: Promise<T>; // In-flight request deduplication
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Fetch with caching and in-flight deduplication.
 * @param url Relative API path, e.g. "/exchanges"
 * @param ttlMs How long to keep the cached response (default: 45 seconds)
 */
export async function cachedGet<T>(url: string, ttlMs = 45_000): Promise<T> {
  const now = Date.now();
  const entry = store.get(url) as CacheEntry<T> | undefined;

  // 1. Return fresh cache hit immediately
  if (entry && entry.data !== undefined && now < entry.expiresAt) {
    return entry.data;
  }

  // 2. Deduplicate concurrent in-flight requests for the exact same URL
  if (entry?.promise) {
    return entry.promise as Promise<T>;
  }

  // 3. Dispatch fresh request
  const promise = api
    .get(url)
    .then((res) => {
      const payload = res.data && typeof res.data === "object" && "data" in res.data
        ? (res.data as { data: T }).data
        : (res.data as T);

      store.set(url, { data: payload, expiresAt: Date.now() + ttlMs });
      return payload;
    })
    .catch((err) => {
      // Remove failed entry so subsequent attempts can retry
      store.delete(url);
      throw err;
    });

  // Store in-flight promise for concurrent callers
  store.set(url, { expiresAt: 0, promise });

  return promise;
}

/**
 * Manually invalidate a specific cache entry (e.g. after a mutation).
 */
export function invalidateCache(url: string): void {
  store.delete(url);
}

/**
 * Invalidate all cache entries matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Clear the entire cache (e.g. on logout or tenant switch).
 */
export function clearCache(): void {
  store.clear();
}
