/**
 * Contrato de datos compartido entre el agente Java, el gateway Node/TS,
 * la API PHP y el frontend React. Es la unica fuente de verdad de los
 * nombres de campo; el agente Java serializa exactamente estas claves.
 */

export type ServerStatus = 'ok' | 'warning' | 'critical' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';
export type OsFamily = 'linux' | 'windows' | 'macos';

/** Muestra de hardware que el agente envia cada `interval_s` segundos. */
export interface MetricSample {
  server_id: string;
  ts: number;              // epoch ms del agente
  cpu_pct: number;         // 0..100
  mem_used_mb: number;
  mem_total_mb: number;
  swap_used_mb: number;
  disks: DiskUsage[];
  net_rx_kbps: number;
  net_tx_kbps: number;
  temp_c: number | null;   // null si el host no expone sensores
  load_1m: number;
  uptime_s: number;
  power: PowerState;       // deteccion de apagones / UPS
  services: ServiceState[];
  security: SecuritySnapshot;
}

export interface DiskUsage {
  mount: string;
  used_gb: number;
  total_gb: number;
  io_wait_pct: number;
}

/** Estado electrico: permite alertar de apagones antes del colapso. */
export interface PowerState {
  source: 'ac' | 'battery' | 'unknown';
  battery_pct: number | null;
  runtime_left_s: number | null;
}

export interface ServiceState {
  name: string;            // nginx, postgresql, docker...
  managed_by: 'systemd' | 'windows-sc' | 'launchd' | 'docker';
  running: boolean;
  pid: number | null;
  cpu_pct: number;
  mem_mb: number;
  port: number | null;
  restarts_24h: number;
}

/** Señales de intento de vulneracion recogidas por el agente. */
export interface SecuritySnapshot {
  failed_logins_5m: number;
  new_sudo_sessions_5m: number;
  banned_ips: string[];
  open_ports_unexpected: number[];
}

/** Ficha administrativa del servidor (vive en la API PHP). */
export interface ServerRecord {
  id: string;
  hostname: string;
  label: string;
  os: OsFamily;
  os_version: string;
  location: string;
  /** null cuando el usuario oculto las IP: el backend no las envia. */
  ip_private: string | null;
  ip_public: string | null;
  /** El usuario decide si las IP se pintan o se enmascaran en la UI. */
  ip_visible: boolean;
  tags: string[];
  agent_version: string;
  last_seen: number | null;
  status: ServerStatus;
}

export interface Alert {
  id: string;
  server_id: string;
  server_label: string;
  severity: Severity;
  kind: 'threshold' | 'outage' | 'power' | 'service' | 'intrusion';
  metric: string;
  message: string;
  value: number | null;
  threshold: number | null;
  ts: number;
  acknowledged: boolean;
}

/** Un mosaico del dashboard: el usuario los mueve, redimensiona y edita. */
export interface Tile {
  id: string;
  kind: TileKind;
  title: string;
  server_id: string | null;   // null = agregado de toda la flota
  metric: string | null;
  /** Ancho en columnas de una rejilla de 12 (Bootstrap grid). */
  w: 3 | 4 | 6 | 12;
  h: 1 | 2;
  order: number;
  options: Record<string, unknown>;
}

export type TileKind =
  | 'gauge'        // CPU / RAM / disco en circulo
  | 'sparkline'    // serie temporal corta
  | 'fleet'        // semaforo de todos los servidores
  | 'services'     // tabla de servicios
  | 'alerts'       // ultimas alertas
  | 'power'        // energia / UPS
  | 'security';    // intentos de vulneracion

export interface DashboardLayout {
  user_id: string;
  name: string;
  tiles: Tile[];
  updated_at: number;
}

/** Mensajes que viajan por el WebSocket del gateway Node. */
export type WsMessage =
  | { type: 'hello'; server_count: number; ts: number }
  | { type: 'metric'; sample: MetricSample }
  | { type: 'alert'; alert: Alert }
  | { type: 'status'; server_id: string; status: ServerStatus }
  | { type: 'pong'; ts: number };

export interface AuthUser {
  id: string;            // identificador unico visible (ej. SNT-4417)
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  totp_enabled: boolean;
}
