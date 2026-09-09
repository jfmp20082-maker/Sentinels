import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo el frontend corre en 5173 y habla con dos backends distintos:
 * el panel PHP (8080) y el gateway de tiempo real (8081). El proxy hace que
 * desde el navegador todo sea el mismo origen: sin CORS y sin URLs absolutas
 * incrustadas en el codigo, que es como se despliega en produccion detras de
 * un solo nginx.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/stream': { target: 'ws://127.0.0.1:8081', ws: true },
    },
    // El contrato de tipos vive fuera de frontend/, en ../shared.
    fs: { allow: ['..'] },
  },
  build: { target: 'es2022', sourcemap: true },
});
