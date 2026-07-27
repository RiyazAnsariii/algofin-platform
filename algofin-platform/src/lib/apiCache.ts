// src/lib/apiCache.ts
// AlgoFin — Production-grade SWR cache with sessionStorage persistence,
// in-flight deduplication, O(1) LRU eviction, and background revalidation.
//
// API surface is unchanged — all pages continue using:
//   cachedGet<T>(url, ttlMs?)
//   invalidateCache(url)
//   invalidateCachePrefix(prefix)
//   clearCache()

import api from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  fetchedAt: number;   // epoch ms when data was fetched
  ttlMs: number;       // how long data is considered fresh
  swrMs: number;       // stale-while-revalidate window after ttlMs
}

interface InFlightEntry<T = unknown> {
  promise: Promise<T>;
  version: number;     // snapshot of cacheVersion when request started
}

// ── Config ───────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 100;         // LRU cap — prevents unbounded memory growth
const STORAGE_KEY = "algofin-api-cache";

// SWR multiplier: stale data is servable for this multiple of TTL
// e.g. TTL=30s → SWR window = 30s * 3 = 90s total before hard-expiry
const SWR_MULTIPLIER = 3;

// ── In-memory store ──────────────────────────────────────────────────────────

// Use Map<url, CacheEntry> as the primary store.
// Map preserves insertion order, so the first key is the LRU (oldest).
// On access we delete + re-insert to move to end (most-recent).
// This gives O(1) LRU insert, O(1) delete, and O(1) evict.
const memStore = new Map<string, CacheEntry>();
const inFlight = new Map<string, InFlightEntry>();

// Cache version — incremented on clearCache() to guard against in-flight
// writes re-populating the store after logout/tenant-switch.
let cacheVersion = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpired(entry: CacheEntry, now: number): boolean {
  return now - entry.fetchedAt >= entry.ttlMs + entry.swrMs;
}

// ── SessionStorage persistence ───────────────────────────────────────────────

function hydrateFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [url, entry] of Object.entries(parsed)) {
      // Only restore entries still within SWR window AND not already loaded
      const maxAge = entry.fetchedAt + entry.ttlMs + entry.swrMs;
      if (now < maxAge && !memStore.has(url)) {
        memStore.set(url, entry);
        // No LRU re-order needed — hydrate in storage order (good enough)
      }
    }
  } catch {
    // Corrupted storage — ignore
  }
}

function persistToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const obj: Record<string, CacheEntry> = {};
    for (const [url, entry] of memStore) {
      // BUG FIX: only persist non-expired entries to avoid bloating sessionStorage
      if (!isExpired(entry, now)) {
        obj[url] = entry;
      }
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

// Hydrate once on module load
hydrateFromStorage();

// ── O(1) LRU via Map insertion-order ─────────────────────────────────────────

function touchLRU(url: string): void {
  const entry = memStore.get(url);
  if (entry !== undefined) {
    // Delete and re-insert → moves key to the end (most-recently-used)
    memStore.delete(url);
    memStore.set(url, entry);
  }
}

function evictLRU(): void {
  // Map.keys() iterates insertion order → first key is LRU
  while (memStore.size > MAX_ENTRIES) {
    const oldest = memStore.keys().next().value;
    if (oldest !== undefined) memStore.delete(oldest);
    else break;
  }
}

// ── Core fetch + unwrap ──────────────────────────────────────────────────────

function fetchAndStore<T>(url: string, ttlMs: number): Promise<T> {
  const swrMs = ttlMs * SWR_MULTIPLIER;
  const capturedVersion = cacheVersion;

  const promise = api
    .get(url)
    .then((res) => {
      // Unwrap SuccessResponse envelope: { data: T }
      const payload =
        res.data && typeof res.data === "object" && "data" in res.data
          ? (res.data as { data: T }).data
          : (res.data as T);

      // BUG FIX: don't write to store if clearCache() was called while in-flight
      if (cacheVersion !== capturedVersion) {
        inFlight.delete(url);
        return payload;
      }

      const entry: CacheEntry<T> = {
        data: payload,
        fetchedAt: Date.now(),
        ttlMs,
        swrMs,
      };

      memStore.set(url, entry as CacheEntry);
      touchLRU(url);
      evictLRU();
      persistToStorage();

      // Clean up in-flight
      inFlight.delete(url);

      return payload;
    })
    .catch((err) => {
      // Clean up so subsequent calls can retry
      inFlight.delete(url);
      throw err;
    });

  // Register in-flight for deduplication
  inFlight.set(url, { promise: promise as Promise<unknown>, version: capturedVersion });

  return promise;
}

// ── Background revalidation (SWR) ────────────────────────────────────────────

function revalidateInBackground<T>(url: string, ttlMs: number): void {
  // Only revalidate if not already in-flight
  if (inFlight.has(url)) return;

  // Fire-and-forget background fetch
  fetchAndStore<T>(url, ttlMs).catch(() => {
    // Silently swallow — stale data was already returned to caller
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch with SWR caching and in-flight deduplication.
 *
 * Behavior:
 *   1. FRESH cache hit (age < ttlMs) → return immediately, no network
 *   2. STALE cache hit (ttlMs < age < ttlMs + swrMs) → return stale data
 *      immediately + trigger background revalidation
 *   3. EXPIRED or MISS → fetch from network (deduplicated)
 *
 * @param url    Relative API path, e.g. "/exchanges"
 * @param ttlMs  How long data is considered fresh (default: 45 seconds)
 */
export async function cachedGet<T>(url: string, ttlMs = 45_000): Promise<T> {
  const now = Date.now();
  const entry = memStore.get(url) as CacheEntry<T> | undefined;

  if (entry) {
    const age = now - entry.fetchedAt;

    // 1. FRESH — return immediately
    if (age < entry.ttlMs) {
      touchLRU(url);
      return entry.data;
    }

    // 2. STALE but within SWR window — return stale + background revalidate
    if (age < entry.ttlMs + entry.swrMs) {
      touchLRU(url);
      revalidateInBackground<T>(url, ttlMs);
      return entry.data;
    }

    // 3. EXPIRED — fall through to network fetch
  }

  // 4. Deduplicate concurrent in-flight requests
  const existing = inFlight.get(url);
  if (existing) {
    return existing.promise as Promise<T>;
  }

  // 5. Fresh network fetch
  return fetchAndStore<T>(url, ttlMs);
}

/**
 * Manually invalidate a specific cache entry (e.g. after a mutation).
 */
export function invalidateCache(url: string): void {
  memStore.delete(url);
  persistToStorage();
}

/**
 * Invalidate all cache entries matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of [...memStore.keys()]) {
    if (key.startsWith(prefix)) {
      memStore.delete(key);
    }
  }
  persistToStorage();
}

/**
 * Clear the entire cache (e.g. on logout or tenant switch).
 * Increments cacheVersion to guard against in-flight writes
 * re-populating the store after the clear.
 */
export function clearCache(): void {
  cacheVersion++;          // invalidates any in-flight fetchAndStore writes
  memStore.clear();
  inFlight.clear();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
