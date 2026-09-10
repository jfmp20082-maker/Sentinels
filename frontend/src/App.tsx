import { lazy, Suspense } from 'react';
import { SessionProvider, useSession } from './context/Session';
import { MODO_DEMO } from './lib/api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

/** Solo se descarga en el build de GitHub Pages. */
const DemoBadge = lazy(() => import('./demo/DemoBadge').then((m) => ({ default: m.DemoBadge })));

/**
 * Raiz de la aplicacion. Un solo interruptor: si hay sesion activa se muestra
 * el panel; si no, el acceso. El enrutado interno del panel es por estado
 * porque el prototipo tiene dos vistas; con mas se meteria React Router.
 */
function Rutas() {
  const { user, cargando } = useSession();

  if (cargando) {
    return (
      <div className="pantalla-carga">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando</span>
        </div>
      </div>
    );
  }
  return user ? <Dashboard /> : <Login />;
}

export function App() {
  return (
    <SessionProvider>
      <Rutas />
      {MODO_DEMO && (
        <Suspense fallback={null}>
          <DemoBadge />
        </Suspense>
      )}
    </SessionProvider>
  );
}
