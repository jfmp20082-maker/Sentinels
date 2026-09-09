import { useCallback, useEffect, useState } from 'react';
import type { ServerRecord, Tile } from '../../../shared/types';
import { api } from '../lib/api';
import { stream, useAlertStream, useStreamConnection, type ConnState } from '../lib/useStream';
import { useSession } from '../context/Session';
import { MosaicGrid } from '../components/MosaicGrid';
import { TileEditor } from '../components/TileEditor';
import { Servers } from './Servers';

/**
 * Pantalla principal. Orquesta tres fuentes:
 *   - catalogo (servidores, mosaicos, historico de alertas) -> API PHP
 *   - metricas y alertas nuevas                             -> WebSocket
 *   - preferencias del usuario                              -> PUT /api/tiles
 */

type Vista = 'mosaicos' | 'servidores';

export function Dashboard() {
  const { user, salir } = useSession();
  const conexion = useStreamConnection(true);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [servidores, setServidores] = useState<ServerRecord[]>([]);
  const [vista, setVista] = useState<Vista>('mosaicos');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [editando, setEditando] = useState<Tile | null | undefined>(undefined); // undefined = cerrado
  const [error, setError] = useState<string | null>(null);
  const alertas = useAlertStream();
  const sinVer = alertas.filter((a) => !a.acknowledged).length;

  useEffect(() => {
    let vivo = true;
    Promise.all([api.tiles(), api.servers(), api.alerts(50)])
      .then(([t, s, a]) => {
        if (!vivo) return;
        setTiles(t);
        setServidores(s);
        stream.seedAlerts(a);   // el historico de PHP siembra el store del stream
      })
      .catch((e) => setError(e.message));
    return () => { vivo = false; };
  }, []);

  const guardarTiles = useCallback(async (nuevos: Tile[]) => {
    setTiles(nuevos);
    try {
      await api.saveTiles(nuevos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el tablero');
      const reales = await api.tiles();
      setTiles(reales);
    }
  }, []);

  const ackAlerta = useCallback(async (id: string) => {
    stream.ackLocal(id);
    try {
      await api.ackAlert(id);
    } catch {
      setError('No se pudo marcar la alerta.');
    }
  }, []);

  const cambiarVisibilidadIp = useCallback(async (id: string, visible: boolean) => {
    const actualizado = await api.updateServer(id, { ip_visible: visible });
    setServidores((prev) => prev.map((s) => (s.id === id ? actualizado : s)));
  }, []);

  return (
    <div className="app-shell">
      <title>Sentinela · Panel</title>

      <TopBar
        conexion={conexion}
        sinVer={sinVer}
        vista={vista}
        setVista={setVista}
        modoEdicion={modoEdicion}
        setModoEdicion={setModoEdicion}
        onNuevoMosaico={() => setEditando(null)}
        usuario={user?.name ?? ''}
        rol={user?.role ?? 'viewer'}
        onSalir={salir}
      />

      <main className="container-fluid py-3 py-lg-4">
        {error && (
          <div className="alert alert-warning alert-dismissible py-2 small" role="alert">
            {error}
            <button className="btn-close" onClick={() => setError(null)} aria-label="Cerrar aviso" />
          </div>
        )}

        {vista === 'mosaicos' ? (
          tiles.length === 0 ? (
            <VacioMosaicos onNuevo={() => { setModoEdicion(true); setEditando(null); }} />
          ) : (
            <MosaicGrid
              tiles={tiles}
              servidores={servidores}
              modoEdicion={modoEdicion}
              onReordenar={guardarTiles}
              onEditar={(t) => setEditando(t)}
              onEliminar={(id) => guardarTiles(tiles.filter((t) => t.id !== id))}
              onAckAlerta={ackAlerta}
            />
          )
        ) : (
          <Servers
            servidores={servidores}
            onCambiarVisibilidad={cambiarVisibilidadIp}
            puedeEditar={user?.role !== 'viewer'}
          />
        )}
      </main>

      {editando !== undefined && (
        <TileEditor
          tile={editando}
          servidores={servidores}
          onCerrar={() => setEditando(undefined)}
          onGuardar={(t) => {
            const existe = tiles.some((x) => x.id === t.id);
            guardarTiles(existe ? tiles.map((x) => (x.id === t.id ? t : x)) : [...tiles, t]);
            setEditando(undefined);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- barra

interface TopBarProps {
  conexion: ConnState;
  sinVer: number;
  vista: Vista;
  setVista: (v: Vista) => void;
  modoEdicion: boolean;
  setModoEdicion: (v: boolean) => void;
  onNuevoMosaico: () => void;
  usuario: string;
  rol: string;
  onSalir: () => void;
}

function TopBar(p: TopBarProps) {
  const claseConexion =
    p.conexion === 'en vivo' ? 'text-success' : p.conexion === 'sin conexion' ? 'text-danger' : 'text-warning';

  return (
    <nav className="navbar navbar-expand sticky-top barra-superior">
      <div className="container-fluid gap-2">
        <span className="navbar-brand d-flex align-items-center gap-2 mb-0">
          <span className="brand-mark chico" aria-hidden="true"><i className="bi bi-shield-check" /></span>
          <span className="fw-semibold">Sentinela</span>
        </span>

        <ul className="nav nav-pills nav-pills-sm d-none d-md-flex">
          <li className="nav-item">
            <button className={`nav-link ${p.vista === 'mosaicos' ? 'active' : ''}`} onClick={() => p.setVista('mosaicos')}>
              <i className="bi bi-grid-1x2 me-1" />Tablero
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${p.vista === 'servidores' ? 'active' : ''}`} onClick={() => p.setVista('servidores')}>
              <i className="bi bi-hdd-network me-1" />Servidores
            </button>
          </li>
        </ul>

        <div className="ms-auto d-flex align-items-center gap-2">
          <span className={`small d-none d-sm-inline ${claseConexion}`} title="Estado del canal de tiempo real">
            <i className="bi bi-broadcast me-1" />{p.conexion}
          </span>

          <button className="btn btn-sm btn-outline-secondary position-relative" title="Alertas sin revisar">
            <i className="bi bi-bell" />
            {p.sinVer > 0 && (
              <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">
                {p.sinVer > 99 ? '99+' : p.sinVer}
              </span>
            )}
          </button>

          {p.vista === 'mosaicos' && (
            <>
              <button
                className={`btn btn-sm ${p.modoEdicion ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => p.setModoEdicion(!p.modoEdicion)}
              >
                <i className="bi bi-pencil-square me-1" />{p.modoEdicion ? 'Listo' : 'Personalizar'}
              </button>
              {p.modoEdicion && (
                <button className="btn btn-sm btn-success" onClick={p.onNuevoMosaico}>
                  <i className="bi bi-plus-lg me-1" />Mosaico
                </button>
              )}
            </>
          )}

          <div className="dropdown">
            <button className="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
              <i className="bi bi-person-circle me-1" /><span className="d-none d-lg-inline">{p.usuario}</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><span className="dropdown-item-text small text-secondary">Rol: {p.rol}</span></li>
              <li><hr className="dropdown-divider" /></li>
              <li><button className="dropdown-item" onClick={p.onSalir}><i className="bi bi-box-arrow-right me-2" />Cerrar sesión</button></li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}

function VacioMosaicos({ onNuevo }: { onNuevo: () => void }) {
  return (
    <div className="text-center py-5">
      <i className="bi bi-grid-3x3-gap display-5 text-secondary" />
      <h2 className="h5 mt-3">Tu tablero está vacío</h2>
      <p className="text-secondary small">Agrega mosaicos para vigilar lo que te importa de cada servidor.</p>
      <button className="btn btn-primary" onClick={onNuevo}><i className="bi bi-plus-lg me-1" />Agregar el primero</button>
    </div>
  );
}
