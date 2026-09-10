import { useEffect, useState } from 'react';
import {
  agentesPausados,
  cancelarEscenario,
  escenariosVigentes,
  ESCENARIOS,
  lanzarEscenario,
  pausarAgentes,
  reiniciar,
} from './runtime';

/**
 * Panel flotante del modo demo. Dice en voz alta que no hay backend detras y
 * concentra lo que hace falta para probar la interfaz sin cronometro: disparar
 * cada incidente al momento, y callar a los agentes para ver la deteccion de
 * caidas, que en la demo local se prueba matando `npm run simulate`.
 */
export function DemoBadge() {
  const [pausado, setPausado] = useState(agentesPausados());
  const [abierto, setAbierto] = useState(false);
  const [vigentes, setVigentes] = useState<Record<string, number>>({});

  // Solo mientras el panel esta abierto: la cuenta atras no vale nada oculta.
  useEffect(() => {
    if (!abierto) return;
    const t = window.setInterval(() => {
      setVigentes(escenariosVigentes());
      setPausado(agentesPausados());
    }, 500);
    setVigentes(escenariosVigentes());
    return () => window.clearInterval(t);
  }, [abierto]);

  const alternarAgentes = () => {
    const nuevo = !pausado;
    pausarAgentes(nuevo);
    setPausado(nuevo);
  };

  const lanzar = (id: string) => {
    lanzarEscenario(id);
    setVigentes(escenariosVigentes());
    setPausado(false);
  };

  const activos = Object.keys(vigentes).length;

  return (
    <div className="position-fixed bottom-0 end-0 m-3 z-3">
      {abierto && (
        <div className="card border-secondary-subtle shadow-lg mb-2" style={{ width: '22rem' }}>
          <div className="card-body p-3">
            <p className="small text-secondary mb-3">
              Compilación estática: no hay API PHP ni gateway Node. Los agentes, el motor de
              alertas y el catálogo corren dentro de esta pestaña y se guardan en este navegador.
            </p>

            <h6 className="small text-uppercase text-secondary mb-2">Provocar un incidente</h6>
            <div className="d-grid gap-1 mb-3" style={{ maxHeight: '15rem', overflowY: 'auto' }}>
              {ESCENARIOS.map((e) => {
                const restante = vigentes[e.id];
                const activo = restante !== undefined;
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`btn btn-sm text-start ${activo ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => (activo ? cancelarEscenario(e.id) : lanzar(e.id))}
                  >
                    <span className="d-flex justify-content-between align-items-center">
                      <span className="fw-medium">{e.titulo}</span>
                      {activo ? (
                        <span className="badge text-bg-dark">{Math.ceil(restante / 1000)} s ×</span>
                      ) : (
                        <i className="bi bi-play-fill" />
                      )}
                    </span>
                    <span className={`d-block small ${activo ? 'text-dark-emphasis' : 'text-secondary'}`}>
                      {e.servidor} · {e.efecto}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              className={`btn btn-sm w-100 mb-2 ${pausado ? 'btn-success' : 'btn-outline-warning'}`}
              type="button"
              onClick={alternarAgentes}
            >
              <i className={`bi ${pausado ? 'bi-play-fill' : 'bi-pause-fill'} me-1`} />
              {pausado ? 'Reanudar agentes' : 'Simular caída de la flota'}
            </button>
            {pausado && (
              <p className="small text-warning mb-2">
                Sin latido: en unos 15 s la flota pasa a <code>offline</code> con alerta.
              </p>
            )}

            <button className="btn btn-sm btn-outline-secondary w-100" type="button" onClick={reiniciar}>
              <i className="bi bi-arrow-counterclockwise me-1" />
              Reiniciar demo
            </button>
          </div>
        </div>
      )}

      <button
        className="btn btn-sm btn-dark border-secondary-subtle shadow"
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        <span className={`badge rounded-pill me-2 ${pausado || activos ? 'bg-warning' : 'bg-info'}`}>
          &nbsp;
        </span>
        Modo demo
        {activos > 0 && <span className="badge text-bg-warning ms-2">{activos}</span>}
      </button>
    </div>
  );
}
