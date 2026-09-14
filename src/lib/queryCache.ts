/**
 * Simple in-memory query cache for Supabase data.
 *
 * Avoids redundant round trips when navigating between pages.
 * Data stays fresh for TTL_MS (default 60 s); stale entries are
 * evicted lazily on next read. Call `invalidate(prefix)` after
 * any mutation to clear related entries.
 *
 * Usage:
 *   const data = await fetchWithCache("sm:subs", () => supabase.from(...).select(...))
 */

const store = new Map<string, { data: unknown; ts: number }>();
const TTL_MS = 60_000; // 60 seconds

function isStale(ts: number): boolean {
  return Date.now() - ts > TTL_MS;
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (isStale(entry.ts)) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): T {
  store.set(key, { data, ts: Date.now() });
  return data;
}

/** Remove all cache entries whose key starts with `prefix`. */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Clear the entire cache (e.g. on sign-out). */
export function clearCache(): void {
  store.clear();
}

/**
 * Fetch-with-cache helper. Immediately returns stale data (fast navigation),
 * then re-fetches in the background if an `onUpdate` callback is provided.
 *
 * @param key     Cache key (e.g. "sm:subscriptions")
 * @param fetcher Async function returning the data
 * @param onUpdate Optional callback called with fresh data after background fetch
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  onUpdate?: (fresh: T) => void,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) {
    if (onUpdate) {
      // Refresh in background so the UI doesn't block
      fetcher().then((fresh) => {
        setCached(key, fresh);
        onUpdate(fresh);
      }).catch(() => { /* silent — cached data is still shown */ });
    }
    return cached;
  }
  const data = await fetcher();
  setCached(key, data);
  return data;
}
