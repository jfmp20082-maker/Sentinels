import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertEngine, type Rule } from '../../realtime-node/src/alerts.ts';
import type { MetricSample } from '../../shared/types';

/**
 * El motor de alertas es la pieza con logica de verdad del prototipo: decide
 * cuando algo es un incidente. Todo lo demas mueve datos. Es tambien lo unico
 * que ejecutan las dos ejecuciones del sistema, el gateway Node y el modo demo
 * del navegador, asi que una regresion aqui rompe las dos a la vez.
 */

const ID = 'srv-core-01';
const ETIQUETAS = new Map([[ID, 'Core API 01']]);

function muestra(cambios: Partial<MetricSample> = {}): MetricSample {
  return {
    server_id: ID,
    ts: Date.now(),
    cpu_pct: 20,
    mem_used_mb: 8_192,
    mem_total_mb: 32_768,
    swap_used_mb: 0,
    disks: [{ mount: '/', used_gb: 300, total_gb: 960, io_wait_pct: 1 }],
    net_rx_kbps: 100,
    net_tx_kbps: 100,
    temp_c: 45,
    load_1m: 1.5,
    uptime_s: 1_000,
    power: { source: 'ac', battery_pct: 100, runtime_left_s: null },
    services: [
      { name: 'nginx', managed_by: 'systemd', running: true, pid: 1, cpu_pct: 1, mem_mb: 100, port: 443, restarts_24h: 0 },
    ],
    security: { failed_logins_5m: 0, new_sudo_sessions_5m: 0, banned_ips: [], open_ports_unexpected: [] },
    ...cambios,
  };
}

const regla = (cambios: Partial<Rule> = {}): Rule => ({
  id: 'r-cpu',
  server_id: null,
  metric: 'cpu_pct',
  op: '>',
  threshold: 85,
  for_s: 5,
  severity: 'warning',
  channels: [],
  enabled: true,
  ...cambios,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('umbrales con histeresis', () => {
  it('no dispara antes de que la condicion se sostenga los for_s', () => {
    const motor = new AlertEngine([regla()], ETIQUETAS);

    expect(motor.evaluate(muestra({ cpu_pct: 90 }))).toHaveLength(0);
    vi.advanceTimersByTime(4_000);
    expect(motor.evaluate(muestra({ cpu_pct: 90 }))).toHaveLength(0);
  });

  it('dispara una vez cumplido el tiempo, y no se repite mientras siga', () => {
    const motor = new AlertEngine([regla()], ETIQUETAS);
    motor.evaluate(muestra({ cpu_pct: 90 }));
    vi.advanceTimersByTime(6_000);

    const alertas = motor.evaluate(muestra({ cpu_pct: 90 }));
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      server_id: ID,
      server_label: 'Core API 01',
      severity: 'warning',
      kind: 'threshold',
      metric: 'cpu_pct',
      threshold: 85,
    });
    expect(alertas[0].message).toContain('CPU en 90.0');

    vi.advanceTimersByTime(10_000);
    expect(motor.evaluate(muestra({ cpu_pct: 90 }))).toHaveLength(0);
  });

  it('se rearma despues de normalizarse', () => {
    const motor = new AlertEngine([regla()], ETIQUETAS);
    motor.evaluate(muestra({ cpu_pct: 90 }));
    vi.advanceTimersByTime(6_000);
    expect(motor.evaluate(muestra({ cpu_pct: 90 }))).toHaveLength(1);

    // Vuelve a la normalidad: se olvida el temporizador y la alerta activa.
    expect(motor.evaluate(muestra({ cpu_pct: 10 }))).toHaveLength(0);

    motor.evaluate(muestra({ cpu_pct: 90 }));
    vi.advanceTimersByTime(6_000);
    expect(motor.evaluate(muestra({ cpu_pct: 90 }))).toHaveLength(1);
  });

  it('un pico que no se sostiene no genera nada', () => {
    const motor = new AlertEngine([regla()], ETIQUETAS);
    motor.evaluate(muestra({ cpu_pct: 99 }));
    vi.advanceTimersByTime(2_000);
    motor.evaluate(muestra({ cpu_pct: 20 }));
    vi.advanceTimersByTime(10_000);

    expect(motor.evaluate(muestra({ cpu_pct: 20 }))).toHaveLength(0);
  });

  it('ignora las reglas deshabilitadas y las de otro servidor', () => {
    const motor = new AlertEngine(
      [regla({ enabled: false }), regla({ id: 'r-otro', server_id: 'srv-db-01', for_s: 0 })],
      ETIQUETAS,
    );
    expect(motor.evaluate(muestra({ cpu_pct: 99 }))).toHaveLength(0);
  });
});

describe('metricas derivadas', () => {
  it('convierte megabytes a porcentaje de memoria', () => {
    const motor = new AlertEngine([regla({ metric: 'mem_pct', threshold: 90, for_s: 0 })], ETIQUETAS);
    const alertas = motor.evaluate(muestra({ mem_used_mb: 31_000, mem_total_mb: 32_768 }));

    expect(alertas).toHaveLength(1);
    expect(alertas[0].value).toBeCloseTo(94.6, 1);
  });

  it('toma el disco mas lleno, no el primero', () => {
    const motor = new AlertEngine([regla({ metric: 'disk_pct', threshold: 88, for_s: 0 })], ETIQUETAS);
    const alertas = motor.evaluate(
      muestra({
        disks: [
          { mount: '/', used_gb: 100, total_gb: 960, io_wait_pct: 1 },
          { mount: '/var', used_gb: 470, total_gb: 480, io_wait_pct: 1 },
        ],
      }),
    );

    expect(alertas).toHaveLength(1);
    expect(alertas[0].value).toBeCloseTo(97.9, 1);
  });

  it('clasifica los logins fallidos como intrusion, no como umbral', () => {
    const motor = new AlertEngine(
      [regla({ metric: 'failed_logins_5m', threshold: 25, for_s: 0, severity: 'critical' })],
      ETIQUETAS,
    );
    const alertas = motor.evaluate(muestra({ security: { failed_logins_5m: 60, new_sudo_sessions_5m: 0, banned_ips: [], open_ports_unexpected: [] } }));

    expect(alertas[0]).toMatchObject({ kind: 'intrusion', severity: 'critical' });
  });
});

describe('condiciones que no son umbrales', () => {
  it('avisa de un servicio detenido y se rearma al volver', () => {
    const motor = new AlertEngine([], ETIQUETAS);
    const parado = muestra({
      services: [{ name: 'nginx', managed_by: 'systemd', running: false, pid: null, cpu_pct: 0, mem_mb: 0, port: 443, restarts_24h: 3 }],
    });

    const alertas = motor.evaluate(parado);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ kind: 'service', severity: 'critical', metric: 'nginx' });

    expect(motor.evaluate(parado)).toHaveLength(0);          // no repite
    expect(motor.evaluate(muestra())).toHaveLength(0);        // vuelve a estar vivo
    expect(motor.evaluate(parado)).toHaveLength(1);           // y puede volver a caer
  });

  it('avisa del apagon con la autonomia que queda', () => {
    const motor = new AlertEngine([], ETIQUETAS);
    const alertas = motor.evaluate(
      muestra({ power: { source: 'battery', battery_pct: 74, runtime_left_s: 1_200 } }),
    );

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ kind: 'power', severity: 'critical' });
    expect(alertas[0].message).toContain('74%');
    expect(alertas[0].message).toContain('20 min');
  });

  it('avisa de puertos fuera de la linea base', () => {
    const motor = new AlertEngine([], ETIQUETAS);
    const alertas = motor.evaluate(
      muestra({ security: { failed_logins_5m: 0, new_sudo_sessions_5m: 0, banned_ips: [], open_ports_unexpected: [4444] } }),
    );

    expect(alertas[0]).toMatchObject({ kind: 'intrusion', severity: 'warning', metric: 'open_ports' });
    expect(alertas[0].message).toContain('4444');
  });
});

describe('caidas por silencio', () => {
  it('no alerta de un servidor del que nunca se supo nada', () => {
    const motor = new AlertEngine([], ETIQUETAS);
    expect(motor.checkOutages(15_000, [ID])).toHaveLength(0);
  });

  it('alerta cuando pasa el tiempo de gracia, una sola vez', () => {
    const motor = new AlertEngine([], ETIQUETAS);
    motor.evaluate(muestra());

    vi.advanceTimersByTime(10_000);
    expect(motor.checkOutages(15_000, [ID])).toHaveLength(0);

    vi.advanceTimersByTime(10_000);
    const alertas = motor.checkOutages(15_000, [ID]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ kind: 'outage', severity: 'critical', metric: 'heartbeat' });

    expect(motor.checkOutages(15_000, [ID])).toHaveLength(0);
  });
});

describe('estado consolidado del servidor', () => {
  it('es offline cuando no hay latido reciente', () => {
    const motor = new AlertEngine([], ETIQUETAS);
    expect(motor.statusOf(ID, 15_000)).toBe('offline');

    motor.evaluate(muestra());
    expect(motor.statusOf(ID, 15_000)).toBe('ok');

    vi.advanceTimersByTime(20_000);
    expect(motor.statusOf(ID, 15_000)).toBe('offline');
  });

  it('se queda con la peor severidad que este activa', () => {
    const motor = new AlertEngine(
      [regla({ for_s: 0 }), regla({ id: 'r-cpu-crit', threshold: 95, for_s: 0, severity: 'critical' })],
      ETIQUETAS,
    );

    motor.evaluate(muestra({ cpu_pct: 90 }));
    expect(motor.statusOf(ID, 15_000)).toBe('warning');

    motor.evaluate(muestra({ cpu_pct: 99 }));
    expect(motor.statusOf(ID, 15_000)).toBe('critical');

    motor.evaluate(muestra({ cpu_pct: 10 }));
    expect(motor.statusOf(ID, 15_000)).toBe('ok');
  });
});
