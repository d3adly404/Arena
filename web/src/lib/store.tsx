/**
 * FieldLink — the workspace state shared by every screen.
 *
 * Same account, same database, same workspace. This provider signs the person in, keeps
 * the connection to the workspace alive, pushes offline actions when the connection
 * returns, and refreshes screens as soon as another device changes something.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, session, RequestFailed, upload, describeDevice } from './api';
import {
  blobList, blobRemove, cacheGet, clearDeviceData, metaGet, metaSet, queueAction, queueList, queueRemove, queueUpdate,
  storageEstimate, QueuedAction, QueuedBlob,
} from './offline';
import { useOnline } from './hooks';

export type Toast = { id: string; message: string; tone: 'info' | 'good' | 'warn' | 'danger'; detail?: string };

export type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
};

type SyncState = {
  online: boolean;
  connected: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  pendingActions: QueuedAction[];
  pendingPhotos: QueuedBlob[];
  refreshKey: number;
  syncNow: (reason?: string) => Promise<void>;
  revision: number;
  storage: { usage: number; quota: number };
};

type AppContextValue = {
  user: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (options?: { keepData?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  sync: SyncState;
  toasts: Toast[];
  toast: (message: string, tone?: Toast['tone'], detail?: string) => void;
  dismissToast: (id: string) => void;
  confirm: (request: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>;
  confirmState: ConfirmRequest | null;
  resolveConfirm: (value: boolean) => void;
  theme: any;
  t: (key: string, fallback?: string) => string;
};

const AppContext = createContext<AppContextValue>(null as any);
export const useApp = () => useContext(AppContext);
export const useSync = () => useContext(AppContext).sync;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);
  const [revision, setRevision] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<QueuedAction[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<QueuedBlob[]>([]);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const online = useOnline();
  const busy = useRef(false);
  const streamRef = useRef<EventSource | null>(null);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info', detail?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone, detail }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'danger' ? 9000 : 5500);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const confirm = useCallback(
    (request: Omit<ConfirmRequest, 'resolve'>) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...request, resolve })),
    [],
  );
  const resolveConfirm = useCallback(
    (value: boolean) => {
      confirmState?.resolve(value);
      setConfirmState(null);
    },
    [confirmState],
  );

  const refreshPending = useCallback(async () => {
    const [actions, photos] = await Promise.all([queueList(), blobList()]);
    setPendingActions(actions);
    setPendingPhotos(photos);
  }, []);

  const loadUser = useCallback(async () => {
    if (!session.token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const result = await api<{ user: any }>('/api/auth/me');
      setUser(result.user);
      setConnected(true);
    } catch (err) {
      if ((err as RequestFailed).status !== 0) setUser(null);
      else setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncNow = useCallback(
    async (reason = 'auto') => {
      if (!session.token || busy.current) return;
      busy.current = true;
      setSyncing(true);
      try {
        // 1. Send everything the device collected while it had no connection.
        const actions = await queueList();
        if (actions.length) {
          const batch = actions.slice(0, 100);
          const result = await api<{ results: any[] }>('/api/sync/queue', {
            method: 'POST',
            body: { mutations: batch.map((a) => ({ client_id: a.client_id, method: a.method, path: a.path, body: a.body })) },
          });
          for (const entry of result.results || []) {
            if (entry.duplicate || entry.ok) await queueRemove(entry.client_id);
            else await queueUpdate(entry.client_id, { attempts: 1, error: entry.response?.error || `Could not be sent (${entry.status}).` });
          }
        }

        // 2. Photographs taken without a connection.
        const photos = await blobList();
        for (const photo of photos.slice(0, 10)) {
          const formData = new FormData();
          Object.entries(photo.fields).forEach(([key, value]) => formData.append(key, value));
          formData.append('files', photo.blob, photo.filename);
          try {
            await upload('/api/media', formData);
            await blobRemove(photo.client_id);
          } catch (err) {
            await queueUpdate(photo.client_id as any, {}).catch(() => {});
            const message = (err as RequestFailed).message;
            if ((err as RequestFailed).status && (err as RequestFailed).status >= 400) {
              toast(`A saved photograph could not be uploaded: ${message}`, 'warn');
            }
          }
        }

        // 3. Pull whatever other devices changed.
        const since = (await metaGet<string>('lastSync')) || '1970-01-01T00:00:00.000Z';
        const changes = await api<any>(`/api/sync/changes?since=${encodeURIComponent(since)}`);
        const changedCount = Object.values((changes.counts || {}) as Record<string, number>)
          .reduce((sum, n) => sum + Number(n || 0), 0);
        await metaSet('lastSync', changes.server_time);
        setLastSyncAt(changes.server_time);
        setConnected(true);
        if (changedCount > 0 && lastSyncAt) {
          setRefreshKey((n) => n + 1);
          setRevision((n) => n + 1);
        }
        const estimate = await storageEstimate();
        setStorage(estimate);
      } catch (err) {
        if ((err as RequestFailed).status === 0) setConnected(false);
      } finally {
        await refreshPending();
        setSyncing(false);
        busy.current = false;
        if (reason !== 'poll') setLoading(false);
      }
    },
    [lastSyncAt, refreshPending, toast],
  );

  /* --------------------------------------------------------------- session */

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST',
        body: { email, password, device: describeDevice() },
        queueable: false,
      });
      session.token = result.token;
      setUser(result.user);
      setConnected(true);
      const cached = await metaGet<string>('lastSync');
      if (cached) await metaSet('lastSync', '1970-01-01T00:00:00.000Z');
      await syncNow('sign-in');
      setRefreshKey((n) => n + 1);
    },
    [syncNow],
  );

  const signOut = useCallback(
    async (options: { keepData?: boolean } = {}) => {
      try {
        await api('/api/auth/logout', { method: 'POST', queueable: false });
      } catch {
        /* signing out on a lost connection still clears this device */
      }
      streamRef.current?.close();
      session.token = null;
      setUser(null);
      if (!options.keepData) await clearDeviceData();
    },
    [],
  );

  const refreshUser = useCallback(async () => {
    const result = await api<{ user: any }>('/api/auth/me');
    setUser(result.user);
  }, []);

  /* ------------------------------------------------------------ lifecycle */

  useEffect(() => {
    (async () => {
      const cachedCategories = await getCachedCategories();
      void cachedCategories;
      await loadUser();
      await refreshPending();
    })();
    const handler = () => {
      session.token = null;
      setUser(null);
      toast('Your session ended. Please sign in again.', 'warn');
    };
    window.addEventListener('fieldlink:signed-out', handler);
    return () => window.removeEventListener('fieldlink:signed-out', handler);
  }, [loadUser, refreshPending, toast]);

  // Catch up whenever the device comes back online or the person returns to the window.
  useEffect(() => {
    if (!user) return;
    syncNow('startup');
    const onOnline = () => {
      toast('Connection restored — sending your saved work.', 'good');
      syncNow('online');
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow('visible');
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') syncNow('poll');
    }, 60000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, [user, syncNow, toast]);

  // Live updates from other devices.
  useEffect(() => {
    if (!user || !session.token) return;
    let stream: EventSource | null = null;
    try {
      stream = new EventSource(`/api/sync/stream?token=${encodeURIComponent(session.token)}`);
      streamRef.current = stream;
      stream.addEventListener('change', () => {
        window.setTimeout(() => syncNow('live'), 400);
      });
      stream.onopen = () => setConnected(true);
      stream.onerror = () => {
        setConnected(false);
      };
    } catch {
      /* polling still keeps devices in step */
    }
    return () => stream?.close();
  }, [user, syncNow]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      refreshUser,
      sync: {
        online,
        connected,
        syncing,
        lastSyncAt,
        pendingActions,
        pendingPhotos,
        refreshKey,
        syncNow,
        revision,
        storage,
      },
      toasts,
      toast,
      dismissToast,
      confirm,
      confirmState,
      resolveConfirm,
      theme: {},
      t: (_key: string, fallback?: string) => fallback || _key,
    }),
    [
      user, loading, signIn, signOut, refreshUser, online, connected, syncing, lastSyncAt, pendingActions, pendingPhotos,
      refreshKey, syncNow, revision, storage, toasts, toast, dismissToast, confirm, confirmState, resolveConfirm,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Keeps the interface responsive while the first sync is happening. */
export async function getCachedCategories() {
  return cacheGet('workspace:categories');
}

export { queueAction, RequestFailed };
