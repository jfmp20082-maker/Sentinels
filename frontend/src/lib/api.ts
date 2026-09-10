import type { Alert, AuthUser, ServerRecord, Tile } from '../../../shared/types';

/**
 * Cliente de la API PHP. Un unico punto donde se adjunta el token, se traduce
 * el error y se normaliza el JSON: los componentes nunca ven un `fetch`.
 *
 * En el build de GitHub Pages (VITE_DEMO=1) no hay API PHP detras, asi que el
 * transporte cambia por un backend simulado que corre en la propia pestaña.
 * Ese es el unico punto del frontend que sabe en que modo esta.
 */

/** Compilado sin backend: todo el sistema vive en el navegador. */
export const MODO_DEMO = import.meta.env.VITE_DEMO === '1';

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
  code_expired: 'El código expiró. Pide uno nuevo con «Reenviar código».',
  unauthorized: 'Sesión no válida.',
  forbidden: 'Tu rol no permite esta acción.',
};

/**
 * Lleva la peticion al backend que toque y devuelve siempre la misma forma:
 * un codigo de estado y el JSON ya interpretado.
 */
async function transporte(path: string, init: RequestInit, token: string | null) {
  if (MODO_DEMO) {
    // Import dinamico: en el build normal este modulo no llega al navegador.
    const { peticion } = await import('../demo/runtime');
    return peticion(path, init, token);
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { status, data } = await transporte(path, init, getToken());
  if (status < 200 || status >= 300) {
    const code = (data as { error?: string } | null)?.error || 'error';
    throw new ApiError(status, code, MENSAJES[code] ?? `Error ${status}`);
  }
  return data as T;
}

/**
 * Ayuda de la pantalla de acceso:
 *   - modo demo (sin backend): codigo TOTP vigente, calculado en el navegador.
 *   - modo real (backend PHP): el codigo del correo. Solo se expone mientras NO
 *     hay SMTP configurado (respaldo de desarrollo); con Gmail puesto, este
 *     endpoint da 404 y el codigo unicamente llega al correo.
 */
export async function codigoDemo(): Promise<{ code: string; expira_en?: number } | null> {
  if (MODO_DEMO) {
    const { totpVigente } = await import('../demo/runtime');
    return totpVigente();
  }
  const res = await fetch('/api/dev/last-code');
  return res.ok ? ((await res.json()) as { code: string }) : null;
}

export interface LoginResult {
  token: string;
  stage: 'pending_2fa' | 'active';
  user: AuthUser;
  /** Correo (enmascarado) al que se envio el codigo, en modo real. */
  sent_to?: string;
}

export const api = {
  login: (id: string, password: string) =>
    request<LoginResult>('/auth/login', { method: 'POST', body: JSON.stringify({ id, password }) }),

  verify2fa: (token: string, code: string) =>
    request<LoginResult>('/auth/2fa', { method: 'POST', body: JSON.stringify({ token, code }) }),

  resend2fa: (token: string) =>
    request<{ ok: boolean; sent_to?: string }>('/auth/resend', { method: 'POST', body: JSON.stringify({ token }) }),

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
