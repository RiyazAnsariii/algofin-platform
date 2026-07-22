// src/lib/apiCache.ts
// Lightweight in-memory API cache.
// Prevents duplicate requests when navigating between pages.
//
// Usage:
//   const data = await cachedGet<MyType>("/endpoint", 60_000); // cache 60s
//
// This is NOT a persistent cache — data lives only for the browser session.
// Each cache entry has a TTL; expired entries are re-fetched transparently.

import api from "./api";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  promise?: Promise<T>;  // in-flight dedup
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Fetch with caching and in-flight deduplication.
 * @param url     Relative API path, e.g. "/exchanges"
 * @param ttlMs   How long to keep the cached response (default: 45 seconds)
 */
export async function cachedGet<T>(url: string, ttlMs = 45_000): Promise<T> {
  const now = Date.now();
  const entry = store.get(url) as CacheEntry<T> | undefined;

  // Return fresh cache hit immediately
  if (entry && now < entry.expiresAt) {
    return entry.data;
  }

  // Deduplicate concurrent in-flight requests for the same URL
  if (entry?.promise) {
    return entry.promise as Promise<T>;
  }

  // Start a new request
  const promise = api
    .get<{ data: T }>(url)
    .then((res) => {
      const data = res.data.data;
      store.set(url, { data, expiresAt: now + ttlMs });
      return data;
    })
    .catch((err) => {
      // Remove failed entry so the next call retries
      store.delete(url);
      throw err;
    });

  // Store the in-flight promise for dedup
  store.set(url, { data: undefined as T, expiresAt: 0, promise });

  return promise;
}

/**
 * Manually invalidate a cache entry (e.g. after a write/mutation).
 */
export function invalidateCache(url: string): void {
  store.delete(url);
}

/**
 * Invalidate all cache entries matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Clear the entire cache (e.g. on logout).
 */
export function clearCache(): void {
  store.clear();
}
