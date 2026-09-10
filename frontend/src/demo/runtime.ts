import type {
  Alert,
  AuthUser,
  MetricSample,
  ServerRecord,
  ServerStatus,
  Tile,
  WsMessage,
} from '../../../shared/types';
import { AlertEngine } from '../../../realtime-node/src/alerts.ts';
import { FakeHost } from '../../../realtime-node/src/fake-host.ts';
import { RULES, SERVERS, SERVICES, TILES, USERS, type DemoUser } from './data';
import { totpExpiraEn, totpNow, totpVerify } from './totp';

/**
 * Modo demo: Novara entero dentro de la pestaña.
 *
 *   FakeHost --> AlertEngine --> store del stream        (sustituye al gateway Node)
 *   router de objetos + localStorage                     (sustituye a la API PHP)
 *
 * El motor de alertas y el generador de metricas son los MISMOS modulos que
 * usa el gateway real; lo unico fingido es el transporte. Existe para publicar
 * el prototipo en GitHub Pages, que solo sirve ficheros estaticos: ni PHP, ni
 * proceso Node, ni WebSocket.
 *
 * Lo que aqui no puede ser cierto, y en el backend real si lo es:
 *   - la contraseña se compara en el cliente (ver DemoUser.password)
 *   - ocultar una IP deja de enviarla desde este modulo, pero el catalogo
 *     completo viaja en el bundle: no es un control de acceso
 *   - no hay agentes reales; nadie puede reportar contra esta demo
 */

const CLAVE_ESTADO = 'sentinela.demo.v1';
const CLAVE_SESIONES = 'sentinela.demo.sesiones';
const PERIODO_MS = 2000;
const OUTAGE_MS = 15_000;
const SESION_MS = 12 * 60 * 60 * 1000;

interface Estado {
  servers: ServerRecord[];
  tiles: Tile[];
  alerts: Alert[];
}

interface Sesion {
  user_id: string;
  stage: 'pending_2fa' | 'active';
  expires_at: number;
}

export interface Respuesta {
  status: number;
  data: unknown;
}

const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ------------------------------------------------------------------- estado

function estadoInicial(): Estado {
  return { servers: clonar(SERVERS), tiles: clonar(TILES), alerts: [] };
}

function leerEstado(): Estado {
  try {
    const crudo = localStorage.getItem(CLAVE_ESTADO);
    if (!crudo) return estadoInicial();
    const guardado = JSON.parse(crudo) as Partial<Estado>;
    return {
      servers: guardado.servers?.length ? guardado.servers : clonar(SERVERS),
      tiles: guardado.tiles ?? clonar(TILES),
      alerts: guardado.alerts ?? [],
    };
  } catch {
    // Almacenamiento bloqueado o JSON corrupto: la demo arranca de cero.
    return estadoInicial();
  }
}

let estado = leerEstado();

function guardar() {
  try {
    localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado));
  } catch {
    // Modo privado o cuota llena: la demo sigue, solo no recuerda.
  }
}

/** Vuelve a la semilla: sirve para el boton "Reiniciar demo". */
export function reiniciar() {
  estado = estadoInicial();
  guardar();
  location.reload();
}

// ----------------------------------------------------------------- sesiones

function leerSesiones(): Record<string, Sesion> {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_SESIONES) ?? '{}') as Record<string, Sesion>;
  } catch {
    return {};
  }
}

let sesiones = leerSesiones();

function guardarSesiones() {
  try {
    sessionStorage.setItem(CLAVE_SESIONES, JSON.stringify(sesiones));
  } catch {
    // Ídem: sin persistencia la sesion muere al recargar, nada mas.
  }
}

function usuarioPublico(u: DemoUser): AuthUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, totp_enabled: Boolean(u.totp_secret) };
}

/** Usuario de una sesion ACTIVA, o null. Mismo contrato que Auth::currentUser. */
function usuarioDe(token: string | null): DemoUser | null {
  if (!token) return null;
  const s = sesiones[token];
  if (!s || s.stage !== 'active' || s.expires_at < Date.now()) return null;
  return USERS.find((u) => u.id === s.user_id) ?? null;
}

// ------------------------------------------------------- motor y simulacion

const etiquetas = new Map(SERVERS.map((s) => [s.id, s.label]));
const motor = new AlertEngine(clonar(RULES), etiquetas);
const hosts = SERVERS.map((s) => new FakeHost(s.id));
const ultimoLatido = new Map<string, number>();
const estados = new Map<string, ServerStatus>();

type Oyente = (msg: WsMessage) => void;
let oyente: Oyente | null = null;
let tempMuestras: number | undefined;
let tempCaidas: number | undefined;
let pausado = false;

function emitir(msg: WsMessage) {
  oyente?.(msg);
}

function registrarAlerta(alert: Alert) {
  estado.alerts = [alert, ...estado.alerts].slice(0, 100);
  guardar();
  emitir({ type: 'alert', alert });
}

// ------------------------------------------------------------- escenarios

/**
 * Incidentes a peticion. El guion de `FakeHost` los produce solos, pero hay que
 * esperarlos: el pico de CPU llega al tick 8, el apagon al 30. Para probar la
 * interfaz eso es un cronometro, no una prueba.
 *
 * Cada escenario retoca la MUESTRA ya generada, no el estado interno del host:
 * asi la condicion se sostiene el tiempo exacto que pide la regla, el host
 * sigue su paseo aleatorio por debajo, y al expirar todo vuelve solo. El motor
 * de alertas no se entera de nada; ve una muestra como cualquier otra.
 */
export interface Escenario {
  id: string;
  titulo: string;
  server_id: string;
  servidor: string;
  /** Que deberia salir, para poder comprobar si el motor hizo lo suyo. */
  efecto: string;
  duracion_ms: number;
  aplicar: (s: MetricSample) => void;
}

export const ESCENARIOS: Escenario[] = [
  {
    id: 'cpu',
    titulo: 'Pico de CPU',
    server_id: 'srv-core-01',
    servidor: 'Core API 01',
    efecto: 'aviso a los 5 s, critica a los 3 s mas',
    duracion_ms: 20_000,
    aplicar: (s) => {
      s.cpu_pct = 97.4;
      s.load_1m = Number((s.cpu_pct / 12).toFixed(2));
    },
  },
  {
    id: 'memoria',
    titulo: 'Presion de memoria',
    server_id: 'srv-db-01',
    servidor: 'PostgreSQL Primario',
    efecto: 'aviso a los 6 s',
    duracion_ms: 20_000,
    aplicar: (s) => {
      s.mem_used_mb = Math.round(s.mem_total_mb * 0.96);
    },
  },
  {
    id: 'disco',
    titulo: 'Disco lleno',
    server_id: 'srv-win-01',
    servidor: 'File Server Corp',
    efecto: 'aviso a los 10 s',
    duracion_ms: 25_000,
    aplicar: (s) => {
      const d = s.disks[0];
      if (d) d.used_gb = Number((d.total_gb * 0.94).toFixed(1));
    },
  },
  {
    id: 'temperatura',
    titulo: 'Sobrecalentamiento',
    server_id: 'srv-edge-01',
    servidor: 'Edge / CDN Dallas',
    efecto: 'critica a los 5 s',
    duracion_ms: 18_000,
    aplicar: (s) => {
      s.temp_c = 88.6;
    },
  },
  {
    id: 'intrusion',
    titulo: 'Fuerza bruta SSH',
    server_id: 'srv-edge-01',
    servidor: 'Edge / CDN Dallas',
    efecto: 'critica inmediata',
    duracion_ms: 12_000,
    aplicar: (s) => {
      s.security.failed_logins_5m = 64;
      s.security.banned_ips = ['185.220.101.7', '45.155.205.233'];
    },
  },
  {
    id: 'servicio',
    titulo: 'Servicio detenido',
    server_id: 'srv-win-01',
    servidor: 'File Server Corp',
    efecto: 'critica inmediata',
    duracion_ms: 15_000,
    aplicar: (s) => {
      const svc = s.services.find((x) => x.name === 'MSSQLSERVER');
      if (svc) {
        svc.running = false;
        svc.pid = null;
        svc.restarts_24h = 3;
      }
    },
  },
  {
    id: 'apagon',
    titulo: 'Apagon con UPS',
    server_id: 'srv-core-02',
    servidor: 'Core API 02',
    efecto: 'critica inmediata',
    duracion_ms: 20_000,
    aplicar: (s) => {
      s.power = { source: 'battery', battery_pct: 74, runtime_left_s: 1_200 };
    },
  },
  {
    id: 'puertos',
    titulo: 'Puerto fuera de linea base',
    server_id: 'srv-build-01',
    servidor: 'Build & CI',
    efecto: 'aviso inmediato',
    duracion_ms: 12_000,
    aplicar: (s) => {
      s.security.open_ports_unexpected = [4444];
    },
  },
];

/** id del escenario -> instante en que deja de aplicarse. */
const escenarios = new Map<string, number>();

/**
 * Dispara un escenario. Si los agentes estaban callados los despierta: sin
 * muestras no hay nada que retocar.
 */
export function lanzarEscenario(id: string) {
  const e = ESCENARIOS.find((x) => x.id === id);
  if (!e) return;
  pausado = false;
  escenarios.set(id, Date.now() + e.duracion_ms);
}

export function cancelarEscenario(id: string) {
  escenarios.delete(id);
}

/** Milisegundos que le quedan a cada escenario vivo, para pintar la cuenta atras. */
export function escenariosVigentes(): Record<string, number> {
  const ahora = Date.now();
  const out: Record<string, number> = {};
  for (const [id, fin] of escenarios) {
    if (fin > ahora) out[id] = fin - ahora;
  }
  return out;
}

function aplicarEscenarios(sample: MetricSample) {
  const ahora = Date.now();
  for (const [id, fin] of escenarios) {
    if (fin <= ahora) {
      escenarios.delete(id);
      continue;
    }
    const e = ESCENARIOS.find((x) => x.id === id);
    if (e && e.server_id === sample.server_id) e.aplicar(sample);
  }
}

function tickMuestras() {
  for (const host of hosts) {
    const sample = host.next();
    aplicarEscenarios(sample);
    ultimoLatido.set(sample.server_id, Date.now());
    emitir({ type: 'metric', sample });
    for (const alert of motor.evaluate(sample)) registrarAlerta(alert);
    const status = motor.statusOf(sample.server_id, OUTAGE_MS);
    if (estados.get(sample.server_id) !== status) {
      estados.set(sample.server_id, status);
      emitir({ type: 'status', server_id: sample.server_id, status });
    }
  }
}

/**
 * Vigilancia de caidas. Corre aunque los agentes esten pausados: es justo el
 * caso que detecta, un servidor que deja de hablar.
 */
function tickCaidas() {
  const ids = SERVERS.map((s) => s.id);
  for (const alert of motor.checkOutages(OUTAGE_MS, ids)) registrarAlerta(alert);
  for (const id of ids) {
    const status = motor.statusOf(id, OUTAGE_MS);
    if (estados.get(id) !== status) {
      estados.set(id, status);
      emitir({ type: 'status', server_id: id, status });
    }
  }
}

/** Arranca la simulacion y engancha el store del stream. Idempotente. */
export function iniciar(fn: Oyente) {
  oyente = fn;
  emitir({ type: 'hello', server_count: SERVERS.length, ts: Date.now() });
  if (tempMuestras === undefined) {
    tickMuestras();
    tempMuestras = window.setInterval(() => {
      if (!pausado) tickMuestras();
    }, PERIODO_MS);
  }
  if (tempCaidas === undefined) {
    tempCaidas = window.setInterval(tickCaidas, 5_000);
  }
}

export function detener() {
  window.clearInterval(tempMuestras);
  window.clearInterval(tempCaidas);
  tempMuestras = undefined;
  tempCaidas = undefined;
  oyente = null;
}

/** Los agentes dejan de reportar: en 15 s la flota entera cae. */
export function pausarAgentes(v: boolean) {
  pausado = v;
}

export function agentesPausados() {
  return pausado;
}

// --------------------------------------------------------------------- API

/**
 * Si el usuario oculto las IP, no se envian. En el backend real esto impide
 * que viajen por la red; aqui es solo coherencia de comportamiento.
 */
function servidorPublico(s: ServerRecord): ServerRecord {
  return {
    ...s,
    ip_private: s.ip_visible ? s.ip_private : null,
    ip_public: s.ip_visible ? s.ip_public : null,
    last_seen: ultimoLatido.get(s.id) ?? null,
    status: estados.get(s.id) ?? 'offline',
  };
}

/** Codigo TOTP vigente, equivalente a GET /api/demo/totp. */
export async function totpVigente(): Promise<{ code: string; expira_en: number } | null> {
  const u = USERS.find((x) => x.totp_secret);
  if (!u?.totp_secret) return null;
  return { code: await totpNow(u.totp_secret), expira_en: totpExpiraEn() };
}

const ok = (data: unknown): Respuesta => ({ status: 200, data });
const err = (status: number, error: string): Respuesta => ({ status, data: { error } });

/**
 * Router de la API falsa. Recibe la misma ruta que `fetch` recibiria tras el
 * prefijo /api, para que `lib/api.ts` no tenga que saber en que modo esta.
 */
export async function peticion(path: string, init: RequestInit, token: string | null): Promise<Respuesta> {
  const metodo = (init.method ?? 'GET').toUpperCase();
  const [ruta, query = ''] = path.split('?');
  const cuerpo = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  const partes = ruta.split('/').filter(Boolean); // ['servers','srv-core-01']

  // --- acceso ---------------------------------------------------------
  if (ruta === '/auth/login' && metodo === 'POST') {
    const id = String(cuerpo.id ?? '').trim();
    const password = String(cuerpo.password ?? '');
    const u = USERS.find((x) => x.id === id || x.email === id);
    if (!u || u.password !== password) return err(401, 'invalid_credentials');

    const necesita2fa = Boolean(u.totp_secret);
    const nuevo = crypto.randomUUID();
    sesiones[nuevo] = {
      user_id: u.id,
      stage: necesita2fa ? 'pending_2fa' : 'active',
      expires_at: Date.now() + (necesita2fa ? 300_000 : SESION_MS),
    };
    guardarSesiones();
    return ok({ token: nuevo, stage: necesita2fa ? 'pending_2fa' : 'active', user: usuarioPublico(u) });
  }

  if (ruta === '/auth/2fa' && metodo === 'POST') {
    const t = String(cuerpo.token ?? '');
    const s = sesiones[t];
    if (!s || s.stage !== 'pending_2fa' || s.expires_at < Date.now()) return err(401, 'invalid_session');
    const u = USERS.find((x) => x.id === s.user_id);
    if (!u?.totp_secret || !(await totpVerify(u.totp_secret, String(cuerpo.code ?? '')))) {
      return err(401, 'invalid_code');
    }
    sesiones[t] = { ...s, stage: 'active', expires_at: Date.now() + SESION_MS };
    guardarSesiones();
    return ok({ token: t, stage: 'active', user: usuarioPublico(u) });
  }

  if (ruta === '/auth/logout' && metodo === 'POST') {
    if (token) delete sesiones[token];
    guardarSesiones();
    return ok({ ok: true });
  }

  if (ruta === '/demo/totp' && metodo === 'GET') {
    const c = await totpVigente();
    return c ? ok(c) : err(404, 'sin_2fa');
  }

  // --- a partir de aqui hace falta sesion activa ----------------------
  const user = usuarioDe(token);
  if (!user) return err(401, 'unauthorized');

  if (ruta === '/me') return ok(usuarioPublico(user));

  if (ruta === '/servers' && metodo === 'GET') {
    return ok([...estado.servers].sort((a, b) => a.label.localeCompare(b.label)).map(servidorPublico));
  }

  if (partes[0] === 'servers' && partes.length === 2) {
    const s = estado.servers.find((x) => x.id === partes[1]);
    if (!s) return err(404, 'not_found');

    if (metodo === 'GET') {
      return ok({
        ...servidorPublico(s),
        services: SERVICES.filter((sv) => sv.server_id === s.id)
          .map(({ name, managed_by, port, critical }) => ({ name, managed_by, port, critical }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }

    if (metodo === 'PATCH') {
      if (user.role === 'viewer') return err(403, 'forbidden');
      if (!('label' in cuerpo) && !('ip_visible' in cuerpo) && !('tags' in cuerpo)) {
        return err(422, 'nothing_to_update');
      }
      if (typeof cuerpo.label === 'string') s.label = cuerpo.label;
      if ('ip_visible' in cuerpo) s.ip_visible = Boolean(cuerpo.ip_visible);
      if (Array.isArray(cuerpo.tags)) s.tags = cuerpo.tags.map(String);
      etiquetas.set(s.id, s.label);
      guardar();
      return ok(servidorPublico(s));
    }
  }

  if (ruta === '/tiles' && metodo === 'GET') {
    return ok(clonar(estado.tiles));
  }

  if (ruta === '/tiles' && metodo === 'PUT') {
    const tiles = Array.isArray(cuerpo.tiles) ? (cuerpo.tiles as Tile[]) : [];
    estado.tiles = tiles.map((t, i) => ({ ...t, order: i }));
    guardar();
    return ok({ ok: true, count: estado.tiles.length });
  }

  if (ruta === '/alerts' && metodo === 'GET') {
    const limite = Math.max(1, Math.min(200, Number(new URLSearchParams(query).get('limit') ?? 50)));
    return ok(clonar(estado.alerts).slice(0, limite));
  }

  if (partes[0] === 'alerts' && partes[2] === 'ack' && metodo === 'POST') {
    estado.alerts = estado.alerts.map((a) => (a.id === partes[1] ? { ...a, acknowledged: true } : a));
    guardar();
    return ok({ ok: true });
  }

  if (ruta === '/alert-rules' && metodo === 'GET') return ok(clonar(RULES));
  if (ruta === '/push/register' && metodo === 'POST') return ok({ ok: true });

  return err(404, 'not_found');
}
