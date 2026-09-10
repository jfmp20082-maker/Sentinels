import type { ServerRecord, Tile } from '../../../shared/types';
import type { Rule } from '../../../realtime-node/src/alerts.ts';

/**
 * Los mismos datos que siembra `api-php/sql/seed.php`, transcritos para el
 * modo demo. Si cambia la semilla, cambia esto: son dos copias del mismo
 * catalogo porque en Pages no hay PHP que lo genere.
 */

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  /**
   * En claro. En el backend real es un `password_hash` de PHP y la
   * comparacion ocurre en el servidor; aqui todo el codigo esta en el
   * navegador, asi que no hay ningun secreto que guardar. Es una maqueta del
   * flujo de acceso, no una barrera.
   */
  password: string;
  totp_secret: string | null;
  role: 'admin' | 'operator' | 'viewer';
}

export const USERS: DemoUser[] = [
  {
    id: 'SNT-4417',
    name: 'Juan Fernando',
    email: 'admin@sentinela.mx',
    password: 'Sentinela#2026',
    totp_secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    role: 'admin',
  },
  {
    id: 'SNT-9002',
    name: 'Operador NOC',
    email: 'noc@sentinela.mx',
    password: 'Noc#2026',
    totp_secret: null,
    role: 'operator',
  },
  {
    // Solo lectura: existe para que el 403 de PATCH sea un camino real y no una
    // rama muerta. Refleja al mismo usuario que siembra api-php/sql/seed.php.
    id: 'SNT-7003',
    name: 'Auditor Lectura',
    email: 'lectura@sentinela.mx',
    password: 'Lectura#2026',
    totp_secret: null,
    role: 'viewer',
  },
];

export const SERVERS: ServerRecord[] = [
  {
    id: 'srv-core-01', hostname: 'core01.mx-qro', label: 'Core API 01',
    os: 'linux', os_version: 'Debian 12', location: 'Queretaro / Rack A3',
    ip_private: '10.20.4.11', ip_public: '189.203.11.4', ip_visible: true,
    tags: ['produccion', 'api'], agent_version: '1.0.0', last_seen: null, status: 'ok',
  },
  {
    id: 'srv-core-02', hostname: 'core02.mx-qro', label: 'Core API 02',
    os: 'linux', os_version: 'Debian 12', location: 'Queretaro / Rack A3',
    ip_private: '10.20.4.12', ip_public: '189.203.11.5', ip_visible: false,
    tags: ['produccion', 'api'], agent_version: '1.0.0', last_seen: null, status: 'ok',
  },
  {
    id: 'srv-db-01', hostname: 'db01.mx-qro', label: 'PostgreSQL Primario',
    os: 'linux', os_version: 'Ubuntu 24.04', location: 'Queretaro / Rack B1',
    ip_private: '10.20.5.20', ip_public: null, ip_visible: false,
    tags: ['produccion', 'datos'], agent_version: '1.0.0', last_seen: null, status: 'ok',
  },
  {
    id: 'srv-win-01', hostname: 'win01.mx-cdmx', label: 'File Server Corp',
    os: 'windows', os_version: 'Server 2022', location: 'CDMX / Oficina',
    ip_private: '10.30.1.8', ip_public: null, ip_visible: true,
    tags: ['corporativo'], agent_version: '1.0.0', last_seen: null, status: 'ok',
  },
  {
    id: 'srv-build-01', hostname: 'build01.mx-cdmx', label: 'Build & CI',
    os: 'macos', os_version: 'macOS 15', location: 'CDMX / Laboratorio',
    ip_private: '10.30.2.40', ip_public: null, ip_visible: true,
    tags: ['ci', 'apple'], agent_version: '1.0.0', last_seen: null, status: 'ok',
  },
  {
    id: 'srv-edge-01', hostname: 'edge01.us-dal', label: 'Edge / CDN Dallas',
    os: 'linux', os_version: 'Alpine 3.20', location: 'Dallas / Equinix',
    ip_private: '10.50.0.3', ip_public: '23.129.64.7', ip_visible: false,
    tags: ['borde', 'cdn'], agent_version: '1.0.0', last_seen: null, status: 'ok',
  },
];

export interface ServiceRow {
  server_id: string;
  name: string;
  managed_by: string;
  port: number | null;
  critical: number;
}

export const SERVICES: ServiceRow[] = [
  { server_id: 'srv-core-01', name: 'nginx', managed_by: 'systemd', port: 443, critical: 1 },
  { server_id: 'srv-core-01', name: 'sentinela-api', managed_by: 'systemd', port: 8080, critical: 1 },
  { server_id: 'srv-core-01', name: 'redis', managed_by: 'systemd', port: 6379, critical: 0 },
  { server_id: 'srv-core-02', name: 'nginx', managed_by: 'systemd', port: 443, critical: 1 },
  { server_id: 'srv-core-02', name: 'sentinela-api', managed_by: 'systemd', port: 8080, critical: 1 },
  { server_id: 'srv-db-01', name: 'postgresql', managed_by: 'systemd', port: 5432, critical: 1 },
  { server_id: 'srv-db-01', name: 'pgbouncer', managed_by: 'systemd', port: 6432, critical: 1 },
  { server_id: 'srv-db-01', name: 'barman', managed_by: 'systemd', port: null, critical: 0 },
  { server_id: 'srv-win-01', name: 'LanmanServer', managed_by: 'windows-sc', port: 445, critical: 1 },
  { server_id: 'srv-win-01', name: 'MSSQLSERVER', managed_by: 'windows-sc', port: 1433, critical: 1 },
  { server_id: 'srv-win-01', name: 'W32Time', managed_by: 'windows-sc', port: null, critical: 0 },
  { server_id: 'srv-build-01', name: 'com.sentinela.runner', managed_by: 'launchd', port: null, critical: 1 },
  { server_id: 'srv-build-01', name: 'docker', managed_by: 'docker', port: 2375, critical: 0 },
  { server_id: 'srv-edge-01', name: 'haproxy', managed_by: 'systemd', port: 80, critical: 1 },
  { server_id: 'srv-edge-01', name: 'varnish', managed_by: 'systemd', port: 6081, critical: 0 },
];

export const TILES: Tile[] = [
  { id: 't1', kind: 'fleet', title: 'Estado de la flota', server_id: null, metric: null, w: 12, h: 1, order: 0, options: {} },
  { id: 't2', kind: 'gauge', title: 'CPU Core API 01', server_id: 'srv-core-01', metric: 'cpu_pct', w: 3, h: 1, order: 1, options: {} },
  { id: 't3', kind: 'gauge', title: 'Memoria PostgreSQL', server_id: 'srv-db-01', metric: 'mem_pct', w: 3, h: 1, order: 2, options: {} },
  { id: 't4', kind: 'gauge', title: 'Disco File Server', server_id: 'srv-win-01', metric: 'disk_pct', w: 3, h: 1, order: 3, options: {} },
  { id: 't5', kind: 'power', title: 'Energia y UPS', server_id: null, metric: null, w: 3, h: 1, order: 4, options: {} },
  { id: 't6', kind: 'sparkline', title: 'CPU ultimos 60 s', server_id: 'srv-core-01', metric: 'cpu_pct', w: 6, h: 1, order: 5, options: {} },
  { id: 't7', kind: 'security', title: 'Intentos de vulneracion', server_id: null, metric: null, w: 6, h: 1, order: 6, options: {} },
  { id: 't8', kind: 'services', title: 'Servicios criticos', server_id: 'srv-db-01', metric: null, w: 6, h: 2, order: 7, options: {} },
  { id: 't9', kind: 'alerts', title: 'Alertas recientes', server_id: null, metric: null, w: 6, h: 2, order: 8, options: {} },
];

/** Las mismas reglas por defecto que aplica el gateway Node. */
export const RULES: Rule[] = [
  { id: 'rule-cpu', server_id: null, metric: 'cpu_pct', op: '>', threshold: 85, for_s: 5, severity: 'warning', channels: ['lan', 'push'], enabled: true },
  { id: 'rule-cpu-crit', server_id: null, metric: 'cpu_pct', op: '>', threshold: 95, for_s: 3, severity: 'critical', channels: ['lan', 'push'], enabled: true },
  { id: 'rule-mem', server_id: null, metric: 'mem_pct', op: '>', threshold: 90, for_s: 6, severity: 'warning', channels: ['lan'], enabled: true },
  { id: 'rule-disk', server_id: null, metric: 'disk_pct', op: '>', threshold: 88, for_s: 10, severity: 'warning', channels: ['lan'], enabled: true },
  { id: 'rule-temp', server_id: null, metric: 'temp_c', op: '>', threshold: 78, for_s: 5, severity: 'critical', channels: ['lan', 'push'], enabled: true },
  { id: 'rule-intrusion', server_id: null, metric: 'failed_logins_5m', op: '>', threshold: 25, for_s: 0, severity: 'critical', channels: ['lan', 'push'], enabled: true },
];
