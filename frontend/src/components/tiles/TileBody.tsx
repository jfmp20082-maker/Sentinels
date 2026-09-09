import { memo } from 'react';
import type { MetricSample, ServerRecord, Tile } from '../../../../shared/types';
import { Barra, Gauge, Sparkline, nivelPorValor } from '../Charts';
import { useAlertStream, useFleetStream, useServerStream } from '../../lib/useStream';

/**
 * Contenido de cada tipo de mosaico. Todos son `memo` y se suscriben solo a la
 * porcion del stream que necesitan, para que 12 mosaicos en pantalla no
 * signifiquen 12 re-renders por muestra recibida.
 */

const pctMem = (s: MetricSample) => (s.mem_total_mb ? (s.mem_used_mb / s.mem_total_mb) * 100 : 0);
const pctDisk = (s: MetricSample) =>
  s.disks.length ? Math.max(...s.disks.map((d) => (d.total_gb ? (d.used_gb / d.total_gb) * 100 : 0))) : 0;

function valorMetrica(s: MetricSample, metric: string): number {
  switch (metric) {
    case 'cpu_pct': return s.cpu_pct;
    case 'mem_pct': return pctMem(s);
    case 'disk_pct': return pctDisk(s);
    case 'temp_c': return s.temp_c ?? 0;
    case 'load_1m': return s.load_1m;
    default: return 0;
  }
}

const NOMBRE_METRICA: Record<string, string> = {
  cpu_pct: 'CPU', mem_pct: 'Memoria', disk_pct: 'Disco', temp_c: 'Temperatura', load_1m: 'Carga 1m',
};

// --------------------------------------------------------------------- gauge

export const GaugeTile = memo(function GaugeTile({ tile }: { tile: Tile }) {
  const { sample } = useServerStream(tile.server_id);
  if (!sample) return <Esperando />;
  const metric = tile.metric ?? 'cpu_pct';
  const valor = valorMetrica(sample, metric);
  const detalle =
    metric === 'mem_pct' ? `${(sample.mem_used_mb / 1024).toFixed(1)} / ${(sample.mem_total_mb / 1024).toFixed(0)} GB`
    : metric === 'disk_pct' ? `${sample.disks[0]?.used_gb.toFixed(0)} / ${sample.disks[0]?.total_gb.toFixed(0)} GB`
    : metric === 'temp_c' ? `${sample.temp_c?.toFixed(1)} °C`
    : `carga ${sample.load_1m.toFixed(2)}`;

  return (
    <div className="d-flex justify-content-center align-items-center h-100">
      <Gauge valor={metric === 'temp_c' ? valor : valor} etiqueta={NOMBRE_METRICA[metric] ?? metric} detalle={detalle} />
    </div>
  );
});

// ----------------------------------------------------------------- sparkline

export const SparklineTile = memo(function SparklineTile({ tile }: { tile: Tile }) {
  const { history } = useServerStream(tile.server_id);
  const metric = tile.metric ?? 'cpu_pct';
  const datos = history.map((s) => valorMetrica(s, metric));
  const ultimo = datos.at(-1) ?? 0;
  return <Sparkline datos={datos} nivel={nivelPorValor(ultimo)} unidad={metric === 'temp_c' ? '°C' : '%'} />;
});

// --------------------------------------------------------------------- flota

export const FleetTile = memo(function FleetTile({ servidores }: { servidores: ServerRecord[] }) {
  const { statuses, samples } = useFleetStream();
  return (
    <div className="fleet-grid">
      {servidores.map((s) => {
        const estado = statuses.get(s.id) ?? s.status;
        const m = samples.get(s.id);
        return (
          <a key={s.id} href={`#/servidor/${s.id}`} className={`fleet-chip estado-${estado}`}>
            <span className="punto" aria-hidden="true" />
            <span className="text-truncate flex-grow-1">{s.label}</span>
            <span className="valor">{m ? `${m.cpu_pct.toFixed(0)}%` : '—'}</span>
          </a>
        );
      })}
    </div>
  );
});

// ----------------------------------------------------------------- servicios

export const ServicesTile = memo(function ServicesTile({ tile }: { tile: Tile }) {
  const { sample } = useServerStream(tile.server_id);
  if (!sample) return <Esperando />;
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0 tabla-compacta">
        <thead>
          <tr>
            <th>Servicio</th><th>Gestor</th><th className="text-end">CPU</th>
            <th className="text-end">RAM</th><th className="text-end">Estado</th>
          </tr>
        </thead>
        <tbody>
          {sample.services.map((sv) => (
            <tr key={sv.name}>
              <td className="text-truncate">
                {sv.name}
                {sv.port && <span className="text-secondary ms-1">:{sv.port}</span>}
              </td>
              <td className="text-secondary">{sv.managed_by}</td>
              <td className="text-end tabular">{sv.cpu_pct.toFixed(1)}%</td>
              <td className="text-end tabular">{sv.mem_mb} MB</td>
              <td className="text-end">
                <span className={`badge rounded-pill ${sv.running ? 'text-bg-success' : 'text-bg-danger'}`}>
                  {sv.running ? 'activo' : 'detenido'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ------------------------------------------------------------------- alertas

export const AlertsTile = memo(function AlertsTile({ onAck }: { onAck: (id: string) => void }) {
  const alertas = useAlertStream();
  if (alertas.length === 0) {
    return <div className="text-secondary small text-center py-4"><i className="bi bi-check2-circle me-1" />Sin alertas activas</div>;
  }
  return (
    <ul className="list-unstyled mb-0 lista-alertas">
      {alertas.slice(0, 8).map((a) => (
        <li key={a.id} className={`alerta sev-${a.severity} ${a.acknowledged ? 'opacity-50' : ''}`}>
          <div className="d-flex align-items-start gap-2">
            <i className={`bi ${a.kind === 'power' ? 'bi-plug' : a.kind === 'intrusion' ? 'bi-shield-exclamation'
              : a.kind === 'outage' ? 'bi-wifi-off' : a.kind === 'service' ? 'bi-gear' : 'bi-graph-up-arrow'}`} />
            <div className="flex-grow-1 min-w-0">
              <div className="small fw-medium text-truncate">{a.server_label}</div>
              <div className="small text-secondary">{a.message}</div>
            </div>
            <div className="text-end">
              <div className="text-secondary" style={{ fontSize: '.7rem' }}>
                {new Date(a.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              {!a.acknowledged && (
                <button className="btn btn-link btn-sm p-0 small" onClick={() => onAck(a.id)}>marcar visto</button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
});

// ------------------------------------------------------------------- energia

export const PowerTile = memo(function PowerTile({ servidores }: { servidores: ServerRecord[] }) {
  const { samples } = useFleetStream();
  const enBateria = servidores.filter((s) => samples.get(s.id)?.power.source === 'battery');
  return (
    <div className="h-100 d-flex flex-column justify-content-center">
      {enBateria.length === 0 ? (
        <div className="text-center">
          <i className="bi bi-plug-fill fs-3 text-success" />
          <div className="small mt-2">Toda la flota con corriente</div>
          <div className="text-secondary" style={{ fontSize: '.72rem' }}>{servidores.length} servidores en CA</div>
        </div>
      ) : (
        enBateria.map((s) => {
          const p = samples.get(s.id)!.power;
          return (
            <div key={s.id} className="mb-2">
              <div className="d-flex justify-content-between small">
                <span className="text-truncate"><i className="bi bi-battery-half text-warning me-1" />{s.label}</span>
                <span className="tabular">{p.battery_pct ?? '?'}%</span>
              </div>
              <Barra valor={100 - (p.battery_pct ?? 0)} nivel="critical" />
              {p.runtime_left_s && (
                <div className="text-secondary" style={{ fontSize: '.7rem' }}>
                  autonomía ~{Math.round(p.runtime_left_s / 60)} min
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
});

// ----------------------------------------------------------------- seguridad

export const SecurityTile = memo(function SecurityTile({ servidores }: { servidores: ServerRecord[] }) {
  const { samples } = useFleetStream();
  const filas = servidores
    .map((s) => ({ servidor: s, sec: samples.get(s.id)?.security }))
    .filter((f) => f.sec)
    .sort((a, b) => (b.sec!.failed_logins_5m ?? 0) - (a.sec!.failed_logins_5m ?? 0))
    .slice(0, 4);

  if (filas.length === 0) return <Esperando />;

  return (
    <ul className="list-unstyled mb-0">
      {filas.map(({ servidor, sec }) => (
        <li key={servidor.id} className="mb-2">
          <div className="d-flex justify-content-between small">
            <span className="text-truncate">{servidor.label}</span>
            <span className={`tabular ${sec!.failed_logins_5m > 25 ? 'text-danger fw-semibold' : 'text-secondary'}`}>
              {sec!.failed_logins_5m} intentos / 5 min
            </span>
          </div>
          <Barra valor={Math.min(100, sec!.failed_logins_5m * 2)} />
          {sec!.banned_ips.length > 0 && (
            <div className="text-secondary text-truncate" style={{ fontSize: '.7rem' }}>
              <i className="bi bi-slash-circle me-1" />bloqueadas: {sec!.banned_ips.join(', ')}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
});

function Esperando() {
  return (
    <div className="text-secondary small text-center py-4">
      <span className="spinner-grow spinner-grow-sm me-2" aria-hidden="true" />
      Esperando al agente...
    </div>
  );
}
