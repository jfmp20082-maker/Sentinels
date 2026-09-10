import { useCallback, useEffect, useState } from 'react';

/**
 * Interruptor de tema claro/oscuro. Escribe `data-bs-theme` en <html> (que es
 * de donde cuelga toda la piel Solvex) y recuerda la eleccion en localStorage.
 * El valor inicial ya lo fija un script en index.html antes de pintar, asi que
 * aqui solo lo leemos para que el icono arranque correcto: sin parpadeo.
 */

type Tema = 'dark' | 'light';
const CLAVE = 'sentinela.tema';

function temaActual(): Tema {
  const attr = document.documentElement.getAttribute('data-bs-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export function aplicarTemaGuardado() {
  let tema: Tema = 'dark';
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'light' || guardado === 'dark') tema = guardado;
  } catch {
    // Almacenamiento bloqueado: se queda en oscuro, el modo nativo.
  }
  document.documentElement.setAttribute('data-bs-theme', tema);
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(temaActual);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', tema);
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      // Sin persistencia: el tema vive solo en esta pestaña.
    }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const claro = tema === 'light';
  return (
    <button
      className="btn btn-sm btn-outline-secondary"
      onClick={alternar}
      title={claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      aria-label={claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
    >
      <i className={`bi ${claro ? 'bi-moon-stars' : 'bi-sun'}`} />
    </button>
  );
}
