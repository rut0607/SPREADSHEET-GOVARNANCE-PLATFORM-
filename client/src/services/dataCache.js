const CACHE_PREFIX = 'dataCache:';
const memCache = new Map();

const persist = (key, data) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch (error) {
    // localStorage may be full or unavailable (private browsing) — cache still works in-memory.
  }
};

const loadPersisted = (key) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw).data : null;
  } catch (error) {
    return null;
  }
};

/**
 * Stale-while-revalidate fetch: returns cached data immediately if present
 * (even if expired) while kicking off a background refresh, so pages can
 * render instantly instead of showing a loading spinner on every visit.
 */
const fetchWithCache = async (key, fetcher, ttlMs = 60000) => {
  const entry = memCache.get(key);
  const now = Date.now();

  if (entry && now < entry.expiresAt) {
    return entry.data;
  }

  const staleData = entry?.data ?? loadPersisted(key);

  const revalidate = fetcher()
    .then((data) => {
      memCache.set(key, { data, expiresAt: Date.now() + ttlMs });
      persist(key, data);
      return data;
    })
    .catch((error) => {
      if (staleData !== null && staleData !== undefined) return staleData;
      throw error;
    });

  if (staleData !== null && staleData !== undefined) {
    revalidate.catch(() => {});
    return staleData;
  }

  return revalidate;
};

const invalidate = (key) => {
  memCache.delete(key);
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch (error) {
    // ignore
  }
};

const invalidatePattern = (pattern) => {
  Array.from(memCache.keys())
    .filter((key) => key.includes(pattern))
    .forEach((key) => memCache.delete(key));

  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX) && key.includes(pattern))
      .forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    // ignore
  }
};

const clear = () => {
  memCache.clear();
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    // ignore
  }
};

export default { fetchWithCache, invalidate, invalidatePattern, clear };
