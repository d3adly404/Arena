/**
 * FieldLink — on-device storage.
 *
 * Three stores keep the workspace usable in the field:
 *   cache   — the last copy of each screen's data, so the app opens instantly and still
 *             shows information when there is no signal.
 *   queue   — actions the officer took while offline, replayed in order when the
 *             connection comes back.
 *   blobs   — photographs taken offline, uploaded when the connection returns.
 *
 * IndexedDB is used where available; if a browser blocks it, FieldLink falls back to
 * memory so the interface keeps working for the current session.
 */
const DB_NAME = 'fieldlink';
const DB_VERSION = 1;
const STORES = ['cache', 'queue', 'blobs', 'meta'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;
const memory: Record<string, Map<string, any>> = { cache: new Map(), queue: new Map(), blobs: new Map(), meta: new Map() };
let useMemory = false;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
    useMemory = true;
    throw err;
  });
  return dbPromise;
}

async function withStore<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  if (useMemory) return null;
  try {
    const db = await open();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = fn(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } catch {
    useMemory = true;
    return null;
  }
}

export async function idbPut(store: StoreName, key: string, value: any, extra: Record<string, any> = {}) {
  if (useMemory) {
    memory[store].set(key, { key, value, ...extra });
    return;
  }
  const result = await withStore(store, 'readwrite', (s) => s.put({ key, value, ...extra }));
  if (result === null && useMemory) memory[store].set(key, { key, value, ...extra });
}

export async function idbGet<T = any>(store: StoreName, key: string): Promise<T | null> {
  if (useMemory) return memory[store].get(key)?.value ?? null;
  const record = await withStore<{ value: T }>(store, 'readonly', (s) => s.get(key));
  if (record) return record.value;
  if (useMemory) return memory[store].get(key)?.value ?? null;
  return null;
}

export async function idbAll<T = any>(store: StoreName): Promise<T[]> {
  if (useMemory) return [...memory[store].values()];
  const rows = await withStore<any[]>(store, 'readonly', (s) => s.getAll());
  if (rows) return rows;
  return [...memory[store].values()];
}

export async function idbDelete(store: StoreName, key: string) {
  if (useMemory) {
    memory[store].delete(key);
    return;
  }
  await withStore(store, 'readwrite', (s) => s.delete(key));
}

/* ------------------------------------------------------------------- cache */

const CACHE_TTL = 1000 * 60 * 60 * 24 * 14;

export async function cacheSet(key: string, value: unknown) {
  await idbPut('cache', key, value, { savedAt: new Date().toISOString() });
}

export async function cacheGet<T = any>(key: string): Promise<{ value: T; savedAt: string } | null> {
  if (useMemory) {
    const record = memory.cache.get(key);
    return record ? { value: record.value as T, savedAt: record.savedAt } : null;
  }
  const record = await withStore<any>('cache', 'readonly', (s) => s.get(key));
  if (record && Date.now() - new Date(record.savedAt).getTime() < CACHE_TTL) {
    return { value: record.value, savedAt: record.savedAt };
  }
  return null;
}

/* ------------------------------------------------------------ action queue */

export type QueuedAction = {
  client_id: string;
  method: string;
  path: string;
  body?: unknown;
  label: string;
  created_at: string;
  attempts: number;
  error?: string | null;
};

export function newClientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueAction(action: Omit<QueuedAction, 'client_id' | 'created_at' | 'attempts'> & { client_id?: string }) {
  const entry: QueuedAction = {
    client_id: action.client_id || newClientId(),
    method: action.method,
    path: action.path,
    body: action.body,
    label: action.label,
    created_at: new Date().toISOString(),
    attempts: 0,
    error: null,
  };
  await idbPut('queue', entry.client_id, entry);
  return entry;
}

export async function queueList(): Promise<QueuedAction[]> {
  const rows = await idbAll<{ key: string; value: QueuedAction }>('queue');
  return rows.map((r) => r.value ?? (r as unknown as QueuedAction)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function queueRemove(clientId: string) {
  await idbDelete('queue', clientId);
}

export async function queueUpdate(clientId: string, patch: Partial<QueuedAction>) {
  const existing = await idbGet<QueuedAction>('queue', clientId);
  if (!existing) return;
  await idbPut('queue', clientId, { ...existing, ...patch });
}

/* --------------------------------------------------------- photo queue */

export type QueuedBlob = {
  client_id: string;
  blob: Blob;
  filename: string;
  fields: Record<string, string>;
  label: string;
  created_at: string;
  error?: string | null;
};

export async function queueBlob(entry: Omit<QueuedBlob, 'client_id' | 'created_at'> & { client_id?: string }) {
  const record: QueuedBlob = {
    client_id: entry.client_id || newClientId(),
    blob: entry.blob,
    filename: entry.filename,
    fields: entry.fields,
    label: entry.label,
    created_at: new Date().toISOString(),
    error: null,
  };
  await idbPut('blobs', record.client_id, record);
  return record;
}

export async function blobList(): Promise<QueuedBlob[]> {
  const rows = await idbAll<{ key: string; value: QueuedBlob }>('blobs');
  return rows.map((r) => r.value ?? (r as unknown as QueuedBlob)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function blobRemove(clientId: string) {
  await idbDelete('blobs', clientId);
}

/* -------------------------------------------------------------------- meta */

export async function metaSet(key: string, value: unknown) {
  await idbPut('meta', key, value);
}

export async function metaGet<T = any>(key: string): Promise<T | null> {
  return idbGet<T>('meta', key);
}

export async function clearDeviceData() {
  for (const store of STORES) {
    const rows = await idbAll<{ key: string }>(store);
    for (const row of rows) await idbDelete(store, row.key);
  }
  for (const store of STORES) memory[store].clear();
}

export async function storageEstimate() {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  }
  return { usage: 0, quota: 0 };
}
