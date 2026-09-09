import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hub } from './hub.ts';
import { AlertEngine, type Rule } from './alerts.ts';
import type { Alert, MetricSample } from '../../shared/types.ts';

/**
 * Sentinela - gateway de tiempo real (Node + TypeScript).
 *
 *   agente Java --HTTP+HMAC--> /ingest --> motor de alertas --> WebSocket /stream
 *                                              |
 *                                              +--> API PHP (historico y latido)
 *
 * PHP hace el CRUD; aqui vive lo que cambia cada segundo y las miles de
 * conexiones abiertas, que es justo donde el modelo de proceso por peticion
 * de PHP se queda corto.
 */

const PORT = Number(process.env.SENTINELA_WS_PORT ?? 8081);
const API = process.env.SENTINELA_API ?? 'http://127.0.0.1:8080';
const SERVICE_TOKEN = process.env.SENTINELA_SERVICE_TOKEN ?? 'dev-service-token';
const OUTAGE_MS = Number(process.env.SENTINELA_OUTAGE_MS ?? 15_000);

interface FleetRow { id: string; label: string; hostname: string; agent_secret: string }

const secrets = new Map<string, string>();
const labels = new Map<string, string>();

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(API + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Carga la flota (y los secretos HMAC de cada agente) desde la API PHP. */
async function loadFleet() {
  try {
    const res = await apiFetch('/internal/fleet');
    const rows = (await res.json()) as FleetRow[];
    for (const r of rows) {
      secrets.set(r.id, r.agent_secret);
      labels.set(r.id, r.label);
    }
    console.log(`[fleet] ${rows.length} servidores cargados`);
  } catch (err) {
    console.error('[fleet] no pude leer la API PHP:', (err as Error).message);
  }
}

/**
 * Reglas por defecto. En produccion se leen de /api/alert-rules; aqui se
 * duplican para que el gateway siga funcionando si el panel esta caido.
 */
const DEFAULT_RULES: Rule[] = [
  { id: 'rule-cpu', server_id: null, metric: 'cpu_pct', op: '>', threshold: 85, for_s: 5, severity: 'warning', channels: ['lan', 'push'], enabled: true },
  { id: 'rule-cpu-crit', server_id: null, metric: 'cpu_pct', op: '>', threshold: 95, for_s: 3, severity: 'critical', channels: ['lan', 'push'], enabled: true },
  { id: 'rule-mem', server_id: null, metric: 'mem_pct', op: '>', threshold: 90, for_s: 6, severity: 'warning', channels: ['lan'], enabled: true },
  { id: 'rule-disk', server_id: null, metric: 'disk_pct', op: '>', threshold: 88, for_s: 10, severity: 'warning', channels: ['lan'], enabled: true },
  { id: 'rule-temp', server_id: null, metric: 'temp_c', op: '>', threshold: 78, for_s: 5, severity: 'critical', channels: ['lan', 'push'], enabled: true },
  { id: 'rule-intrusion', server_id: null, metric: 'failed_logins_5m', op: '>', threshold: 25, for_s: 0, severity: 'critical', channels: ['lan', 'push'], enabled: true },
];

const engine = new AlertEngine(DEFAULT_RULES, labels);

/** Verifica la firma HMAC-SHA256 del cuerpo enviado por el agente. */
function signatureOk(serverId: string, body: string, header: string | undefined): boolean {
  const secret = secrets.get(serverId);
  if (!secret || !header) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(header, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error('payload demasiado grande'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Guarda la alerta en PHP y la empuja a los navegadores conectados. */
async function emit(alert: Alert) {
  hub.broadcast({ type: 'alert', alert });
  console.log(`[alerta:${alert.severity}] ${alert.server_label} - ${alert.message}`);
  try {
    await apiFetch('/internal/alerts', { method: 'POST', body: JSON.stringify(alert) });
  } catch (err) {
    console.error('[alerta] no se pudo persistir:', (err as Error).message);
  }
  // Aqui saldria el push a APNs/FCM para la app movil.
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/healthz') {
    return json(res, 200, { ok: true, clients: hub.clientCount, servers: secrets.size });
  }

  // Ingesta de los agentes Java.
  if (url.pathname === '/ingest' && req.method === 'POST') {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      return json(res, 413, { error: 'payload_too_large' });
    }
    let sample: MetricSample;
    try {
      sample = JSON.parse(raw) as MetricSample;
    } catch {
      return json(res, 400, { error: 'json_invalido' });
    }
    if (!signatureOk(sample.server_id, raw, req.headers['x-sentinela-signature'] as string | undefined)) {
      console.warn(`[ingest] firma invalida de ${sample.server_id}`);
      return json(res, 401, { error: 'firma_invalida' });
    }

    hub.record(sample);
    hub.broadcast({ type: 'metric', sample });

    for (const alert of engine.evaluate(sample)) void emit(alert);

    const status = engine.statusOf(sample.server_id, OUTAGE_MS);
    hub.publishStatus(sample.server_id, status);
    void apiFetch('/internal/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ server_id: sample.server_id, ts: sample.ts, status, agent_version: '1.0.0' }),
    }).catch(() => {});

    return json(res, 202, { ok: true });
  }

  json(res, 404, { error: 'not_found' });
});

/** El WebSocket reutiliza la sesion del panel: se valida contra PHP /api/me. */
const hub = new Hub(server, async (token) => {
  if (!token) return false;
  try {
    const res = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
});

// Vigilancia de caidas: si un servidor calla mas de OUTAGE_MS, se alerta.
setInterval(() => {
  const ids = [...new Set([...secrets.keys(), ...hub.knownServers()])];
  for (const alert of engine.checkOutages(OUTAGE_MS, ids)) void emit(alert);
  for (const id of ids) hub.publishStatus(id, engine.statusOf(id, OUTAGE_MS));
}, 5_000);

// La lista de servidores puede cambiar sin reiniciar el gateway.
setInterval(loadFleet, 60_000).unref();

await loadFleet();
server.listen(PORT, () => {
  console.log(`[gateway] http://127.0.0.1:${PORT}  (ingesta /ingest, stream ws://.../stream)`);
});
