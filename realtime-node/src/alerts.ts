import { randomUUID } from 'node:crypto';
import type { Alert, MetricSample, Severity, ServerStatus } from '../../shared/types.ts';

export interface Rule {
  id: string;
  server_id: string | null;
  metric: string;
  op: '>' | '<' | '>=' | '<=';
  threshold: number;
  /** Segundos que la condicion debe sostenerse antes de disparar (histeresis). */
  for_s: number;
  severity: Severity;
  channels: string[];
  enabled: boolean;
}

/** Metricas derivadas: la regla habla de porcentajes, la muestra de megabytes. */
function derive(sample: MetricSample): Record<string, number> {
  const memPct = sample.mem_total_mb > 0 ? (sample.mem_used_mb / sample.mem_total_mb) * 100 : 0;
  const diskPct = sample.disks.length
    ? Math.max(...sample.disks.map((d) => (d.total_gb > 0 ? (d.used_gb / d.total_gb) * 100 : 0)))
    : 0;
  return {
    cpu_pct: sample.cpu_pct,
    mem_pct: memPct,
    disk_pct: diskPct,
    load_1m: sample.load_1m,
    temp_c: sample.temp_c ?? 0,
    net_rx_kbps: sample.net_rx_kbps,
    net_tx_kbps: sample.net_tx_kbps,
    failed_logins_5m: sample.security.failed_logins_5m,
    battery_pct: sample.power.battery_pct ?? 100,
  };
}

function compare(value: number, op: Rule['op'], threshold: number): boolean {
  switch (op) {
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
  }
}

const LABEL: Record<string, string> = {
  cpu_pct: 'CPU', mem_pct: 'Memoria', disk_pct: 'Disco', temp_c: 'Temperatura',
  load_1m: 'Carga 1m', failed_logins_5m: 'Logins fallidos', battery_pct: 'Bateria',
};

/**
 * Motor de alertas. Vive en Node porque es un problema de flujo: cada muestra
 * atraviesa las reglas en memoria y solo el resultado (raro) se persiste en PHP.
 * Evaluar esto en la base de datos costaria una consulta por metrica por segundo.
 */
export class AlertEngine {
  /** metrica+servidor -> instante en que la condicion empezo a cumplirse. */
  private pending = new Map<string, number>();
  /** Alertas ya disparadas, para no repetirlas mientras siga el problema. */
  private firing = new Map<string, Alert>();
  /** Ultimo latido por servidor: base de la deteccion de caidas. */
  private lastSeen = new Map<string, number>();

  private rules: Rule[];
  private labels: Map<string, string>;

  constructor(rules: Rule[], labels: Map<string, string>) {
    this.rules = rules;
    this.labels = labels;
  }

  setRules(rules: Rule[]) {
    this.rules = rules;
  }

  label(serverId: string) {
    return this.labels.get(serverId) ?? serverId;
  }

  /** Evalua una muestra y devuelve las alertas NUEVAS que hay que emitir. */
  evaluate(sample: MetricSample): Alert[] {
    this.lastSeen.set(sample.server_id, Date.now());
    const values = derive(sample);
    const out: Alert[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.server_id && rule.server_id !== sample.server_id) continue;
      const value = values[rule.metric];
      if (value === undefined) continue;

      const key = `${rule.id}:${sample.server_id}`;
      if (!compare(value, rule.op, rule.threshold)) {
        // Se normalizo: limpiamos el temporizador y damos por cerrada la alerta.
        this.pending.delete(key);
        this.firing.delete(key);
        continue;
      }
      const since = this.pending.get(key) ?? Date.now();
      this.pending.set(key, since);
      if (Date.now() - since < rule.for_s * 1000) continue;   // aun en histeresis
      if (this.firing.has(key)) continue;                     // ya avisamos

      const name = LABEL[rule.metric] ?? rule.metric;
      const alert: Alert = {
        id: randomUUID(),
        server_id: sample.server_id,
        server_label: this.label(sample.server_id),
        severity: rule.severity,
        kind: rule.metric === 'failed_logins_5m' ? 'intrusion' : 'threshold',
        metric: rule.metric,
        message: `${name} en ${value.toFixed(1)} (umbral ${rule.op} ${rule.threshold})`,
        value: Number(value.toFixed(2)),
        threshold: rule.threshold,
        ts: Date.now(),
        acknowledged: false,
      };
      this.firing.set(key, alert);
      out.push(alert);
    }

    out.push(...this.nonThreshold(sample));
    return out;
  }

  /** Reglas que no son un simple umbral: energia, servicios caidos, puertos. */
  private nonThreshold(sample: MetricSample): Alert[] {
    const out: Alert[] = [];
    const base = {
      server_id: sample.server_id,
      server_label: this.label(sample.server_id),
      ts: Date.now(),
      acknowledged: false,
      value: null,
      threshold: null,
    };

    if (sample.power.source === 'battery') {
      const key = `power:${sample.server_id}`;
      if (!this.firing.has(key)) {
        const mins = sample.power.runtime_left_s ? Math.round(sample.power.runtime_left_s / 60) : null;
        const alert: Alert = {
          ...base, id: randomUUID(), severity: 'critical', kind: 'power', metric: 'power',
          message: `Apagon: corriendo con UPS al ${sample.power.battery_pct ?? '?'}%`
            + (mins !== null ? `, autonomia ~${mins} min` : ''),
        };
        this.firing.set(key, alert);
        out.push(alert);
      }
    } else {
      this.firing.delete(`power:${sample.server_id}`);
    }

    for (const svc of sample.services) {
      const key = `svc:${sample.server_id}:${svc.name}`;
      if (!svc.running && !this.firing.has(key)) {
        const alert: Alert = {
          ...base, id: randomUUID(), severity: 'critical', kind: 'service', metric: svc.name,
          message: `Servicio ${svc.name} detenido (${svc.managed_by})`,
        };
        this.firing.set(key, alert);
        out.push(alert);
      } else if (svc.running) {
        this.firing.delete(key);
      }
    }

    if (sample.security.open_ports_unexpected.length) {
      const key = `ports:${sample.server_id}`;
      if (!this.firing.has(key)) {
        const alert: Alert = {
          ...base, id: randomUUID(), severity: 'warning', kind: 'intrusion', metric: 'open_ports',
          message: `Puertos abiertos fuera de linea base: ${sample.security.open_ports_unexpected.join(', ')}`,
        };
        this.firing.set(key, alert);
        out.push(alert);
      }
    } else {
      this.firing.delete(`ports:${sample.server_id}`);
    }

    return out;
  }

  /**
   * Caida = silencio. Se llama desde un temporizador, no desde una muestra:
   * un servidor apagado justamente deja de mandar datos.
   */
  checkOutages(timeoutMs: number, servers: string[]): Alert[] {
    const out: Alert[] = [];
    const now = Date.now();
    for (const id of servers) {
      const seen = this.lastSeen.get(id);
      const key = `outage:${id}`;
      if (seen !== undefined && now - seen > timeoutMs) {
        if (!this.firing.has(key)) {
          const alert: Alert = {
            id: randomUUID(), server_id: id, server_label: this.label(id),
            severity: 'critical', kind: 'outage', metric: 'heartbeat',
            message: `Sin latido desde hace ${Math.round((now - seen) / 1000)} s`,
            value: null, threshold: null, ts: now, acknowledged: false,
          };
          this.firing.set(key, alert);
          out.push(alert);
        }
      } else {
        this.firing.delete(key);
      }
    }
    return out;
  }

  /** Estado consolidado del servidor para el semaforo de la flota. */
  statusOf(serverId: string, timeoutMs: number): ServerStatus {
    const seen = this.lastSeen.get(serverId);
    if (seen === undefined || Date.now() - seen > timeoutMs) return 'offline';
    let worst: ServerStatus = 'ok';
    for (const [key, alert] of this.firing) {
      if (!key.includes(serverId)) continue;
      if (alert.severity === 'critical') return 'critical';
      if (alert.severity === 'warning') worst = 'warning';
    }
    return worst;
  }
}
