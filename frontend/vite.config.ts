import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo el frontend corre en 5173 y habla con dos backends distintos:
 * el panel PHP (8080) y el gateway de tiempo real (8081). El proxy hace que
 * desde el navegador todo sea el mismo origen: sin CORS y sin URLs absolutas
 * incrustadas en el codigo, que es como se despliega en produccion detras de
 * un solo nginx.
 *
 * Tres destinos, la misma configuracion base:
 *   - local        npm run dev
 *   - Codespaces   igual, pero el navegador entra por https://...app.github.dev
 *   - Pages        npm run build:demo, estatico y sin backend detras
 */
const enCodespaces = Boolean(process.env.CODESPACES);

export default defineConfig(({ mode }) => {
  // `--mode demo` en local, o VITE_DEMO=1 desde el workflow de Pages.
  const demo = mode === 'demo' || process.env.VITE_DEMO === '1';

  return {
    plugins: [react()],
    // Pages sirve el sitio en /<repo>/, no en la raiz del dominio.
    base: process.env.VITE_BASE ?? '/',
    define: {
      'import.meta.env.VITE_DEMO': JSON.stringify(demo ? '1' : '0'),
    },
    server: {
      port: 5173,
      // En un contenedor hay que escuchar en todas las interfaces para que el
      // reenvio de puertos de Codespaces alcance al servidor.
      host: enCodespaces ? true : 'localhost',
      allowedHosts: enCodespaces ? ['.app.github.dev'] : undefined,
      // El navegador llega por https/443, no por el 5173 del contenedor: sin
      // esto el cliente de recarga en caliente buscaria un ws:// inexistente.
      hmr: enCodespaces ? { protocol: 'wss' as const, clientPort: 443 } : undefined,
      proxy: {
        '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
        '/stream': { target: 'ws://127.0.0.1:8081', ws: true },
      },
      // El contrato de tipos vive fuera de frontend/, en ../shared.
      fs: { allow: ['..'] },
    },
    // El build de demo se publica en un sitio abierto: sin sourcemaps, que
    // entregarian el fuente legible del frontend a cualquiera que lo abra.
    build: { target: 'es2022', sourcemap: !demo },
  };
});
