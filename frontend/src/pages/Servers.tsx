import { useOptimistic, useTransition } from 'react';
import type { ServerRecord } from '../../../shared/types';
import { Barra } from '../components/Charts';
import { useFleetStream } from '../lib/useStream';

/**
 * Inventario de servidores: qué servicios gestiona cada uno y sus direcciones IP,
 * que el usuario puede hacer visibles o invisibles.
 *
 * Importante: ocultar la IP no es una decision de presentacion. Cuando esta
 * oculta, la API PHP devuelve `ip_private: null` y el dato no llega siquiera al
 * navegador; aqui solo se pinta lo que el backend permitio ver.
 */

const ICONO_SO: Record<string, string> = { linux: 'bi-ubuntu', windows: 'bi-windows', macos: 'bi-apple' };

interface Props {
  servidores: ServerRecord[];
  onCambiarVisibilidad: (id: string, visible: boolean) => Promise<void>;
  puedeEditar: boolean;
}

export function Servers({ servidores, onCambiarVisibilidad, puedeEditar }: Props) {
  const { statuses, samples } = useFleetStream();
  const [, startTransition] = useTransition();

  // El interruptor de IP responde al instante; si el PATCH falla React revierte.
  const [lista, cambiarOptimista] = useOptimistic(
    servidores,
    (actuales: ServerRecord[], { id, visible }: { id: string; visible: boolean }) =>
      actuales.map((s) => (s.id === id ? { ...s, ip_visible: visible, ip_private: visible ? s.ip_private : null } : s)),
  );

  const alternar = (s: ServerRecord) => {
    startTransition(async () => {
      cambiarOptimista({ id: s.id, visible: !s.ip_visible });
      await onCambiarVisibilidad(s.id, !s.ip_visible);
    });
  };

  return (
    <div className="card mosaico">
      <header className="card-header d-flex align-items-center">
        <h2 className="h6 mb-0 flex-grow-1">
          <i className="bi bi-hdd-network me-2" />Servidores registrados
        </h2>
        <span className="badge text-bg-secondary-subtle text-secondary">{lista.length}</span>
      </header>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0 tabla-servidores">
          <thead>
            <tr>
              <th>Servidor</th>
              <th>Ubicación</th>
              <th>Direcciones IP</th>
              <th>Servicios en ejecución</th>
              <th className="text-end">Carga</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => {
              const estado = statuses.get(s.id) ?? s.status;
              const m = samples.get(s.id);
              const activos = m?.services.filter((x) => x.running).length ?? 0;
              return (
                <tr key={s.id}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className={`punto estado-${estado}`} title={estado} aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="fw-medium text-truncate">
                          <i className={`bi ${ICONO_SO[s.os] ?? 'bi-hdd'} me-1 text-secondary`} />
                          {s.label}
                        </div>
                        <div className="text-secondary small text-truncate">{s.hostname} · {s.os_version}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small text-secondary">{s.location}</td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div className="ip-celda">
                        {s.ip_visible ? (
                          <>
                            <code className="d-block">{s.ip_private ?? '···'}</code>
                            {s.ip_public && <code className="d-block text-secondary">{s.ip_public}</code>}
                          </>
                        ) : (
                          <span className="text-secondary small fst-italic">oculta por el usuario</span>
                        )}
                      </div>
                      <button
                        className="btn btn-sm btn-outline-secondary border-0"
                        onClick={() => alternar(s)}
                        disabled={!puedeEditar}
                        title={s.ip_visible ? 'Ocultar direcciones IP' : 'Mostrar direcciones IP'}
                        aria-label={`${s.ip_visible ? 'Ocultar' : 'Mostrar'} IP de ${s.label}`}
                        aria-pressed={s.ip_visible}
                      >
                        <i className={`bi ${s.ip_visible ? 'bi-eye' : 'bi-eye-slash'}`} />
                      </button>
                    </div>
                  </td>
                  <td>
                    {m ? (
                      <div className="d-flex flex-wrap gap-1">
                        {m.services.map((sv) => (
                          <span
                            key={sv.name}
                            className={`badge rounded-pill ${sv.running ? 'text-bg-dark border border-secondary-subtle' : 'text-bg-danger'}`}
                            title={`${sv.managed_by}${sv.port ? ' · puerto ' + sv.port : ''}`}
                          >
                            {sv.name}
                          </span>
                        ))}
                        <span className="text-secondary small ms-1">{activos}/{m.services.length}</span>
                      </div>
                    ) : (
                      <span className="text-secondary small">sin datos del agente</span>
                    )}
                  </td>
                  <td className="text-end" style={{ minWidth: 120 }}>
                    {m ? (
                      <>
                        <div className="small tabular">{m.cpu_pct.toFixed(0)}% CPU</div>
                        <Barra valor={m.cpu_pct} />
                      </>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!puedeEditar && (
        <div className="card-footer small text-secondary">
          Tu rol es de solo lectura: no puedes cambiar la visibilidad de las IP.
        </div>
      )}
    </div>
  );
}
