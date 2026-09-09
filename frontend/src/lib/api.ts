import type { Alert, AuthUser, ServerRecord, Tile } from '../../../shared/types';

/**
 * Cliente de la API PHP. Un unico punto donde se adjunta el token, se traduce
 * el error y se normaliza el JSON: los componentes nunca ven un `fetch`.
 */

const TOKEN_KEY = 'sentinela.token';

export function getToken(): string | null {
  // sessionStorage y no localStorage: la sesion muere al cerrar la pestaña,
  // que es lo que se espera de un panel de operaciones.
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MENSAJES: Record<string, string> = {
  invalid_credentials: 'Identificador o contraseña incorrectos.',
  account_locked: 'Cuenta bloqueada temporalmente por intentos fallidos.',
  invalid_code: 'El código de verificación no es válido.',
  invalid_session: 'La sesión expiró, vuelve a iniciar sesión.',
  unauthorized: 'Sesión no válida.',
  forbidden: 'Tu rol no permite esta acción.',
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const code = (data && data.error) || 'error';
    throw new ApiError(res.status, code, MENSAJES[code] ?? `Error ${res.status}`);
  }
  return data as T;
}

export interface LoginResult {
  token: string;
  stage: 'pending_2fa' | 'active';
  user: AuthUser;
}

export const api = {
  login: (id: string, password: string) =>
    request<LoginResult>('/auth/login', { method: 'POST', body: JSON.stringify({ id, password }) }),

  verify2fa: (token: string, code: string) =>
    request<LoginResult>('/auth/2fa', { method: 'POST', body: JSON.stringify({ token, code }) }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<AuthUser>('/me'),

  servers: () => request<ServerRecord[]>('/servers'),

  server: (id: string) => request<ServerRecord & { services: unknown[] }>(`/servers/${id}`),

  updateServer: (id: string, patch: Partial<Pick<ServerRecord, 'label' | 'ip_visible' | 'tags'>>) =>
    request<ServerRecord>(`/servers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  tiles: () => request<Tile[]>('/tiles'),

  saveTiles: (tiles: Tile[]) =>
    request<{ ok: boolean; count: number }>('/tiles', { method: 'PUT', body: JSON.stringify({ tiles }) }),

  alerts: (limit = 50) => request<Alert[]>(`/alerts?limit=${limit}`),

  ackAlert: (id: string) => request<{ ok: boolean }>(`/alerts/${id}/ack`, { method: 'POST' }),
};
