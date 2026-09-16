/**
 * FieldLink — talking to the workspace server.
 *
 * Every request carries the sign-in token, so every device is simply a client of the
 * same workspace. When the connection is not there, write actions are queued on the
 * device instead of failing, and are sent again automatically once signal returns.
 */
import { cacheGet, cacheSet, queueAction, newClientId } from './offline';

const TOKEN_KEY = 'fieldlink.token';
const DEVICE_KEY = 'fieldlink.device';

export type ApiError = { error: string; detail?: string; status?: number; missing_required?: any[]; queued?: boolean };

export const session = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(value: string | null) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private browsing — the session simply will not survive a reload */
    }
  },
  get device() {
    try {
      return (
        localStorage.getItem(DEVICE_KEY) ||
        `${describeDevice()} (${navigator.platform || 'unknown'})`
      );
    } catch {
      return 'FieldLink device';
    }
  },
};

export function describeDevice() {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Android/i.test(ua)) return 'Android phone';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows computer';
  if (/Linux/i.test(ua)) return 'Linux computer';
  return 'FieldLink device';
}

export class RequestFailed extends Error {
  status: number;
  payload: ApiError;
  constructor(status: number, payload: ApiError) {
    super(payload?.error || 'The request could not be completed.');
    this.status = status;
    this.payload = payload || { error: 'The request could not be completed.' };
  }
}

export function fileUrl(path: string | null | undefined, token = session.token) {
  if (!path) return null;
  if (path.startsWith('data:') || path.startsWith('blob:')) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}token=${encodeURIComponent(token || '')}`;
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  /** Can this action wait until the device has a connection again? */
  queueable?: boolean;
  queueLabel?: string;
  cacheKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'X-FieldLink-Client': 'web',
    'X-FieldLink-Device': session.device,
  };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload: BodyInit | undefined;
  if (options.formData) {
    payload = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
    if (options.signal) options.signal.addEventListener('abort', () => controller.abort());
    response = await fetch(path, { method, headers, body: payload, signal: controller.signal });
    clearTimeout(timer);
  } catch (networkError) {
    // No connection. Reads fall back to the saved copy, writes go into the queue.
    if (method === 'GET' && options.cacheKey) {
      const cached = await cacheGet<T>(options.cacheKey);
      if (cached) return cached.value;
    }
    if (method !== 'GET' && options.queueable !== false) {
      await queueAction({
        method,
        path,
        body: options.body,
        label: options.queueLabel || `${method} ${path}`,
      });
      return { queued: true, offline: true } as unknown as T;
    }
    throw new RequestFailed(0, { error: 'No connection to FieldLink. Your work is saved on this device.' });
  }

  if (response.status === 204) return {} as T;
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Unexpected response from the server.' };
  }

  if (!response.ok) {
    if (response.status === 401) {
      session.token = null;
      window.dispatchEvent(new CustomEvent('fieldlink:signed-out'));
    }
    throw new RequestFailed(response.status, data || { error: 'Request failed.' });
  }

  if (method === 'GET' && options.cacheKey) await cacheSet(options.cacheKey, data);
  return data as T;
}

export const get = <T = any>(path: string, cacheKey?: string) => api<T>(path, { cacheKey });
export const post = <T = any>(path: string, body?: unknown, extra: Partial<Options> = {}) =>
  api<T>(path, { method: 'POST', body, queueable: true, ...extra });
export const patch = <T = any>(path: string, body?: unknown, extra: Partial<Options> = {}) =>
  api<T>(path, { method: 'PATCH', body, queueable: true, ...extra });
export const del = <T = any>(path: string, extra: Partial<Options> = {}) =>
  api<T>(path, { method: 'DELETE', ...extra });

export async function upload<T = any>(path: string, formData: FormData, extra: Partial<Options> = {}) {
  return api<T>(path, { method: 'POST', formData, queueable: false, ...extra });
}

export { newClientId };
