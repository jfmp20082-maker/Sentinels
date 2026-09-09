import { useState } from 'react';
import type { ServerRecord, Tile, TileKind } from '../../../shared/types';

/**
 * Editor de un mosaico (panel lateral de Bootstrap).
 *
 * Se controla desde React en vez de usar el JS de Bootstrap: el estado de
 * apertura ya vive en el componente padre y mezclar los dos sistemas termina
 * en paneles que se quedan abiertos cuando React re-renderiza.
 */

const TIPOS: Array<{ kind: TileKind; nombre: string; icono: string; necesitaServidor: boolean; metricas: boolean }> = [
  { kind: 'gauge', nombre: 'Medidor', icono: 'bi-speedometer2', necesitaServidor: true, metricas: true },
  { kind: 'sparkline', nombre: 'Serie temporal', icono: 'bi-graph-up', necesitaServidor: true, metricas: true },
  { kind: 'services', nombre: 'Servicios', icono: 'bi-hdd-stack', necesitaServidor: true, metricas: false },
  { kind: 'fleet', nombre: 'Flota', icono: 'bi-grid-3x3-gap', necesitaServidor: false, metricas: false },
  { kind: 'alerts', nombre: 'Alertas', icono: 'bi-bell', necesitaServidor: false, metricas: false },
  { kind: 'power', nombre: 'Energía / UPS', icono: 'bi-plug', necesitaServidor: false, metricas: false },
  { kind: 'security', nombre: 'Seguridad', icono: 'bi-shield-lock', necesitaServidor: false, metricas: false },
];

const METRICAS = [
  { id: 'cpu_pct', nombre: 'CPU (%)' },
  { id: 'mem_pct', nombre: 'Memoria (%)' },
  { id: 'disk_pct', nombre: 'Disco (%)' },
  { id: 'temp_c', nombre: 'Temperatura (°C)' },
  { id: 'load_1m', nombre: 'Carga 1 min' },
];

const ANCHOS: Array<Tile['w']> = [3, 4, 6, 12];

interface Props {
  tile: Tile | null;          // null = creando uno nuevo
  servidores: ServerRecord[];
  onGuardar: (tile: Tile) => void;
  onCerrar: () => void;
}

export function TileEditor({ tile, servidores, onGuardar, onCerrar }: Props) {
  const [borrador, setBorrador] = useState<Tile>(
    tile ?? {
      id: `t-${crypto.randomUUID().slice(0, 8)}`,
      kind: 'gauge',
      title: 'Nuevo mosaico',
      server_id: servidores[0]?.id ?? null,
      metric: 'cpu_pct',
      w: 3,
      h: 1,
      order: 999,
      options: {},
    },
  );

  const tipo = TIPOS.find((t) => t.kind === borrador.kind)!;
  const set = (patch: Partial<Tile>) => setBorrador((b) => ({ ...b, ...patch }));

  return (
    <>
      <div className="offcanvas-backdrop fade show" onClick={onCerrar} />
      <aside className="offcanvas offcanvas-end show editor-mosaico" tabIndex={-1} aria-label="Editor de mosaico">
        <div className="offcanvas-header border-bottom">
          <h2 className="offcanvas-title h6 mb-0">{tile ? 'Editar mosaico' : 'Nuevo mosaico'}</h2>
          <button className="btn-close" aria-label="Cerrar" onClick={onCerrar} />
        </div>

        <div className="offcanvas-body">
          <label className="form-label small text-secondary">Tipo</label>
          <div className="row g-2 mb-3">
            {TIPOS.map((t) => (
              <div className="col-6" key={t.kind}>
                <button
                  type="button"
                  className={`btn w-100 text-start btn-tipo ${borrador.kind === t.kind ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() =>
                    set({
                      kind: t.kind,
                      server_id: t.necesitaServidor ? borrador.server_id ?? servidores[0]?.id ?? null : null,
                      metric: t.metricas ? borrador.metric ?? 'cpu_pct' : null,
                      title: borrador.title === 'Nuevo mosaico' ? t.nombre : borrador.title,
                    })
                  }
                >
                  <i className={`bi ${t.icono} me-2`} />
                  <span className="small">{t.nombre}</span>
                </button>
              </div>
            ))}
          </div>

          <div className="mb-3">
            <label className="form-label small text-secondary" htmlFor="tile-title">Título</label>
            <input
              id="tile-title" className="form-control" value={borrador.title}
              onChange={(e) => set({ title: e.target.value })} maxLength={48}
            />
          </div>

          {tipo.necesitaServidor && (
            <div className="mb-3">
              <label className="form-label small text-secondary" htmlFor="tile-server">Servidor</label>
              <select
                id="tile-server" className="form-select" value={borrador.server_id ?? ''}
                onChange={(e) => set({ server_id: e.target.value })}
              >
                {servidores.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          {tipo.metricas && (
            <div className="mb-3">
              <label className="form-label small text-secondary" htmlFor="tile-metric">Métrica</label>
              <select
                id="tile-metric" className="form-select" value={borrador.metric ?? 'cpu_pct'}
                onChange={(e) => set({ metric: e.target.value })}
              >
                {METRICAS.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-3">
            <label className="form-label small text-secondary">Ancho (columnas de 12)</label>
            <div className="btn-group w-100" role="group">
              {ANCHOS.map((w) => (
                <button
                  key={w} type="button"
                  className={`btn ${borrador.w === w ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => set({ w })}
                >
                  {w === 12 ? 'completo' : `${w}/12`}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label small text-secondary">Alto</label>
            <div className="btn-group w-100" role="group">
              {([1, 2] as const).map((h) => (
                <button
                  key={h} type="button"
                  className={`btn ${borrador.h === h ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => set({ h })}
                >
                  {h === 1 ? 'normal' : 'doble'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex gap-2">
          <button className="btn btn-outline-secondary flex-grow-1" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary flex-grow-1" onClick={() => onGuardar(borrador)}>Guardar</button>
        </div>
      </aside>
    </>
  );
}
