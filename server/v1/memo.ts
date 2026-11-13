/**
 * A tiny per-instance cache with request coalescing, for PUBLIC catalogue reads only.
 *
 * During a spike the CDN may miss for many visitors at once (a new deploy, a purge, a cold edge). Without this, every one of those
 * misses becomes its own database query. With it, one query runs per key per few seconds and everyone waiting shares the answer.
 *
 * Rules that keep it safe:
 *  - never use it for anything user-specific or authenticated (callers pass no token and build the key from public inputs only);
 *  - only successful results are stored (errors are never cached);
 *  - if a refresh fails, the previous answer is served for a short grace period instead of failing the visitor;
 *  - bounded: at most \`max\` keys, oldest dropped first.
 */
type Entry = { value: unknown; freshUntil: number; staleUntil: number };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>, o: { graceMs?: number; max?: number; ttlOf?: (value: T) => number } = {}): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.freshUntil > now) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;           // someone is already fetching this: share their answer
  const p = (async () => {
    try {
      const value = await load();
      const t = Date.now();
      store.delete(key);                                // re-insert so the oldest entries are the ones dropped
      const ttl = o.ttlOf ? o.ttlOf(value) : ttlMs;   // a result can ask to be remembered for a different time
      store.set(key, { value, freshUntil: t + ttl, staleUntil: t + ttl + (o.graceMs ?? 5 * 60_000) });
      const max = o.max ?? 300;
      while (store.size > max) { const first = store.keys().next().value; if (first === undefined) break; store.delete(first); }
      return value;
    } catch (e) {
      if (hit && hit.staleUntil > Date.now()) return hit.value as T;   // the database stumbled: keep serving the last good answer
      throw e;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

/** For tests and diagnostics only. */
export const memoSize = () => store.size;
export const memoClear = () => { store.clear(); inflight.clear(); };
