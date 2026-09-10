import type { MetricSample, ServiceState } from '../../shared/types.ts';

/**
 * Host simulado: paseo aleatorio sobre las metricas mas un guion determinista
 * de incidentes. No depende de Node ni del navegador, solo de `Math.random` y
 * `Date.now`, para que sirva tanto al simulador de agentes (`simulator.ts`)
 * como al modo demo que corre entero dentro del navegador en GitHub Pages.
 */

export const SERVICES: Record<string, Array<[string, ServiceState['managed_by'], number | null]>> = {
  'srv-core-01': [['nginx', 'systemd', 443], ['sentinela-api', 'systemd', 8080], ['redis', 'systemd', 6379]],
  'srv-core-02': [['nginx', 'systemd', 443], ['sentinela-api', 'systemd', 8080]],
  'srv-db-01': [['postgresql', 'systemd', 5432], ['pgbouncer', 'systemd', 6432], ['barman', 'systemd', null]],
  'srv-win-01': [['LanmanServer', 'windows-sc', 445], ['MSSQLSERVER', 'windows-sc', 1433], ['W32Time', 'windows-sc', null]],
  'srv-build-01': [['com.sentinela.runner', 'launchd', null], ['docker', 'docker', 2375]],
  'srv-edge-01': [['haproxy', 'systemd', 80], ['varnish', 'systemd', 6081]],
};

export class FakeHost {
  cpu = 20 + Math.random() * 20;
  mem: number;
  disk: number;
  temp = 45 + Math.random() * 10;
  tick = 0;
  onBattery = false;
  downService: string | null = null;

  id: string;
  /** Solo lo usa el simulador de Node para firmar con HMAC; el navegador no firma. */
  secret: string;
  memTotal: number;
  diskTotal: number;

  constructor(id: string, secret = '', memTotal = 32768, diskTotal = 960) {
    this.id = id;
    this.secret = secret;
    this.memTotal = memTotal;
    this.diskTotal = diskTotal;
    this.mem = memTotal * (0.35 + Math.random() * 0.2);
    this.disk = diskTotal * (0.4 + Math.random() * 0.2);
  }

  /** Guion determinista para que la demo muestre cada tipo de alerta. */
  private script() {
    const t = this.tick;
    if (this.id === 'srv-core-01' && t > 8 && t < 26) this.cpu = Math.min(99, this.cpu + 9);   // pico de CPU
    if (this.id === 'srv-db-01' && t > 14 && t < 40) this.mem = Math.min(this.memTotal * 0.97, this.mem * 1.05);
    if (this.id === 'srv-win-01' && t === 18) this.downService = 'MSSQLSERVER';                // servicio caido
    if (this.id === 'srv-win-01' && t === 45) this.downService = null;
    if (this.id === 'srv-edge-01' && t > 22 && t < 34) this.temp = Math.min(92, this.temp + 4); // sobrecalentamiento
    if (this.id === 'srv-core-02' && t === 30) this.onBattery = true;                           // apagon
    if (this.id === 'srv-core-02' && t === 60) this.onBattery = false;
  }

  next(): MetricSample {
    this.tick++;
    const drift = (base: number, amp: number) => base + (Math.random() - 0.5) * amp;
    this.cpu = Math.max(2, Math.min(100, drift(this.cpu, 12) * 0.9 + 25 * 0.1));
    this.mem = Math.max(this.memTotal * 0.2, Math.min(this.memTotal * 0.98, drift(this.mem, this.memTotal * 0.02)));
    this.disk = Math.min(this.diskTotal * 0.99, this.disk + Math.random() * 0.05);
    this.temp = Math.max(35, Math.min(95, drift(this.temp, 2)));
    this.script();

    // Ataque de fuerza bruta simulado en el borde: dispara alerta de intrusion.
    const brute = this.id === 'srv-edge-01' && this.tick % 25 > 18;

    const services = (SERVICES[this.id] ?? []).map(([name, managed_by, port]): ServiceState => ({
      name,
      managed_by,
      running: this.downService !== name,
      pid: this.downService === name ? null : 1000 + Math.floor(Math.random() * 8000),
      cpu_pct: Number((Math.random() * 8).toFixed(1)),
      mem_mb: Math.round(80 + Math.random() * 900),
      port,
      restarts_24h: this.downService === name ? 3 : 0,
    }));

    return {
      server_id: this.id,
      ts: Date.now(),
      cpu_pct: Number(this.cpu.toFixed(1)),
      mem_used_mb: Math.round(this.mem),
      mem_total_mb: this.memTotal,
      swap_used_mb: Math.round(Math.random() * 512),
      disks: [
        { mount: '/', used_gb: Number(this.disk.toFixed(1)), total_gb: this.diskTotal, io_wait_pct: Number((Math.random() * 6).toFixed(1)) },
        { mount: '/var', used_gb: Number((this.disk * 0.4).toFixed(1)), total_gb: this.diskTotal * 0.5, io_wait_pct: Number((Math.random() * 4).toFixed(1)) },
      ],
      net_rx_kbps: Math.round(200 + Math.random() * 9000),
      net_tx_kbps: Math.round(150 + Math.random() * 7000),
      temp_c: Number(this.temp.toFixed(1)),
      load_1m: Number((this.cpu / 12).toFixed(2)),
      uptime_s: 86400 * 12 + this.tick * 2,
      power: this.onBattery
        ? { source: 'battery', battery_pct: Math.max(5, 92 - (this.tick - 30) * 2), runtime_left_s: 1200 }
        : { source: 'ac', battery_pct: 100, runtime_left_s: null },
      services,
      security: {
        failed_logins_5m: brute ? 30 + Math.floor(Math.random() * 40) : Math.floor(Math.random() * 4),
        new_sudo_sessions_5m: Math.random() > 0.9 ? 1 : 0,
        banned_ips: brute ? ['185.220.101.7', '45.155.205.233'] : [],
        open_ports_unexpected: this.id === 'srv-build-01' && this.tick % 40 > 33 ? [4444] : [],
      },
    };
  }
}
