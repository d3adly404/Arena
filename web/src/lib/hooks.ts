import { useCallback, useEffect, useRef, useState } from 'react';
import { api, RequestFailed } from './api';
import * as offline from './offline';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const list = window.matchMedia(query);
    const handler = () => setMatches(list.matches);
    handler();
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  savedAt: string | null;
  reload: () => void;
};

/**
 * Load data from the workspace. When the device has no connection the last saved copy
 * is shown instead, clearly marked as saved information.
 */
export function useApi<T = any>(path: string | null, options: { cacheKey?: string; deps?: unknown[]; skip?: boolean } = {}): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const depsKey = JSON.stringify(options.deps ?? []);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!path || options.skip) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>(path, { cacheKey: options.cacheKey })
      .then((result) => {
        if (cancelled || !alive.current) return;
        setData(result);
        setStale(false);
        setSavedAt(new Date().toISOString());
      })
      .catch(async (err: RequestFailed) => {
        if (cancelled) return;
        if (err.status === 0 && options.cacheKey) {
          const { cacheGet } = offline;
          const cached = await cacheGet<T>(options.cacheKey);
          if (cached) {
            setData(cached.value);
            setStale(true);
            setSavedAt(cached.savedAt);
            setError(null);
            setLoading(false);
            return;
          }
        }
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, options.cacheKey, depsKey, tick, options.skip]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, error, stale, savedAt, reload };
}

/** Save draft text with a short delay, so typing never fights the network. */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delay = 1200) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'queued' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const first = useRef(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await save(value);
        setStatus('saved');
        setLastSavedAt(new Date().toISOString());
      } catch (err: any) {
        setStatus(err?.payload?.offline || err?.status === 0 ? 'queued' : 'error');
      }
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  return { status, lastSavedAt };
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const clean = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = clean.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { name: segments[0] || 'home', segments, query, hash };
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const target = to.startsWith('#') ? to : `#${to.startsWith('/') ? '' : '/'}${to}`;
  if (options.replace) window.location.replace(target);
  else window.location.hash = target;
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
