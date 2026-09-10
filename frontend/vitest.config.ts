import { defineConfig } from 'vitest/config';

/**
 * Configuracion propia, separada de `vite.config.ts`: las pruebas no necesitan
 * el proxy hacia PHP ni el plugin de React, y el entorno es Node.
 *
 * Node y no jsdom a proposito. Lo que se prueba aqui no toca el DOM: el motor
 * de alertas, el TOTP y el router de la API falsa. Node 22 ya trae
 * `crypto.subtle` y `crypto.randomUUID`, que es lo unico del navegador que
 * hace falta; `localStorage` se sustituye a mano donde toca.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
