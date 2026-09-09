import { useOptimistic, useRef, useState, useTransition } from 'react';
import type { ServerRecord, Tile } from '../../../shared/types';
import { AlertsTile, FleetTile, GaugeTile, PowerTile, SecurityTile, ServicesTile, SparklineTile } from './tiles/TileBody';

/**
 * Rejilla de mosaicos personalizable.
 *
 * Se apoya en la rejilla de 12 columnas de Bootstrap: cada mosaico declara su
 * ancho (3/4/6/12) y el navegador hace el reflujo solo, incluido el responsive.
 * No hace falta una libreria de "dashboard grid" ni calcular posiciones a mano.
 *
 * El reordenamiento usa `useOptimistic` de React 19: la tarjeta se mueve en el
 * mismo frame del `drop` y la peticion PUT viaja despues. Si el guardado falla,
 * React revierte el estado optimista y volvemos a la posicion real.
 */

interface Props {
  tiles: Tile[];
  servidores: ServerRecord[];
  modoEdicion: boolean;
  onReordenar: (tiles: Tile[]) => Promise<void>;
  onEditar: (tile: Tile) => void;
  onEliminar: (id: string) => void;
  onAckAlerta: (id: string) => void;
}

export function MosaicGrid({ tiles, servidores, modoEdicion, onReordenar, onEditar, onEliminar, onAckAlerta }: Props) {
  const [, startTransition] = useTransition();
  // El id arrastrado vive en un ref, no solo en el estado: `drop` puede llegar
  // antes de que React vuelva a renderizar y el manejador leeria un valor
  // caducado. El estado se mantiene en paralelo solo para los estilos.
  const arrastradoRef = useRef<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  const iniciarArrastre = (id: string) => {
    arrastradoRef.current = id;
    setArrastrando(id);
  };

  const terminarArrastre = () => {
    arrastradoRef.current = null;
    setArrastrando(null);
    setEncima(null);
  };

  const [tilesOptimistas, moverOptimista] = useOptimistic(
    tiles,
    (actuales: Tile[], { origen, destino }: { origen: string; destino: string }) => {
      const i = actuales.findIndex((t) => t.id === origen);
      const j = actuales.findIndex((t) => t.id === destino);
      if (i < 0 || j < 0 || i === j) return actuales;
      const copia = [...actuales];
      const [movido] = copia.splice(i, 1);
      copia.splice(j, 0, movido!);
      return copia.map((t, idx) => ({ ...t, order: idx }));
    },
  );

  const soltar = (destino: string) => {
    const origen = arrastradoRef.current;
    terminarArrastre();
    if (!origen || origen === destino) return;

    // La actualizacion optimista debe ir dentro de la transicion junto con la
    // accion asincrona; asi React sabe cuando revertirla.
    startTransition(async () => {
      moverOptimista({ origen, destino });
      const i = tiles.findIndex((t) => t.id === origen);
      const j = tiles.findIndex((t) => t.id === destino);
      if (i < 0 || j < 0) return;
      const copia = [...tiles];
      const [movido] = copia.splice(i, 1);
      copia.splice(j, 0, movido!);
      await onReordenar(copia.map((t, idx) => ({ ...t, order: idx })));
    });
  };

  return (
    <div className="row g-3">
      {tilesOptimistas.map((tile) => (
        <div
          key={tile.id}
          className={`col-12 col-md-${Math.max(6, tile.w)} col-xl-${tile.w}`}
          draggable={modoEdicion}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; iniciarArrastre(tile.id); }}
          onDragEnd={terminarArrastre}
          onDragOver={(e) => {
            if (!modoEdicion || !arrastradoRef.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setEncima(tile.id);
          }}
          onDragLeave={() => setEncima((prev) => (prev === tile.id ? null : prev))}
          onDrop={(e) => { e.preventDefault(); soltar(tile.id); }}
        >
          <section
            className={[
              'card mosaico h-100',
              modoEdicion ? 'editable' : '',
              arrastrando === tile.id ? 'arrastrando' : '',
              encima === tile.id && arrastrando !== tile.id ? 'destino' : '',
              tile.h === 2 ? 'alto-2' : '',
              // El semaforo de flota crece con su contenido: forzarle una
              // altura minima solo dejaria un hueco negro debajo.
              tile.kind === 'fleet' ? 'auto' : '',
            ].join(' ')}
            aria-label={tile.title}
          >
            <header className="card-header d-flex align-items-center gap-2">
              {modoEdicion && <i className="bi bi-grip-vertical text-secondary asa" aria-hidden="true" />}
              <h2 className="h6 mb-0 flex-grow-1 text-truncate">{tile.title}</h2>
              {modoEdicion ? (
                <div className="btn-group btn-group-sm">
                  <button className="btn btn-outline-secondary" onClick={() => onEditar(tile)} aria-label={`Editar ${tile.title}`}>
                    <i className="bi bi-sliders" />
                  </button>
                  <button className="btn btn-outline-danger" onClick={() => onEliminar(tile.id)} aria-label={`Quitar ${tile.title}`}>
                    <i className="bi bi-x-lg" />
                  </button>
                </div>
              ) : (
                <EtiquetaServidor tile={tile} servidores={servidores} />
              )}
            </header>
            <div className="card-body">
              <CuerpoMosaico tile={tile} servidores={servidores} onAckAlerta={onAckAlerta} />
            </div>
          </section>
        </div>
      ))}
    </div>
  );
}

function EtiquetaServidor({ tile, servidores }: { tile: Tile; servidores: ServerRecord[] }) {
  if (!tile.server_id) return <span className="badge text-bg-secondary-subtle text-secondary">flota</span>;
  const s = servidores.find((x) => x.id === tile.server_id);
  return <span className="badge text-bg-secondary-subtle text-secondary text-truncate mw-50">{s?.label ?? tile.server_id}</span>;
}

function CuerpoMosaico({ tile, servidores, onAckAlerta }: { tile: Tile; servidores: ServerRecord[]; onAckAlerta: (id: string) => void }) {
  switch (tile.kind) {
    case 'gauge': return <GaugeTile tile={tile} />;
    case 'sparkline': return <SparklineTile tile={tile} />;
    case 'fleet': return <FleetTile servidores={servidores} />;
    case 'services': return <ServicesTile tile={tile} />;
    case 'alerts': return <AlertsTile onAck={onAckAlerta} />;
    case 'power': return <PowerTile servidores={servidores} />;
    case 'security': return <SecurityTile servidores={servidores} />;
    default: return <div className="text-secondary small">Tipo de mosaico desconocido: {tile.kind}</div>;
  }
}
