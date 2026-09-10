#!/usr/bin/env bash
# Levanta las cuatro piezas del prototipo en una sola terminal.
# Ctrl+C detiene todo.
set -euo pipefail
cd "$(dirname "$0")"

# El codigo ya no trae un token de servicio por defecto (fallaria abriendo los
# endpoints internos). Lo fija aqui el lanzador local, un valor de desarrollo
# que las tres piezas comparten. No viaja a ningun despliegue: eso lo pone el
# operador, distinto, en su entorno.
export SENTINELA_SERVICE_TOKEN="${SENTINELA_SERVICE_TOKEN:-dev-local-$(date +%s)}"

limpiar() { kill 0 2>/dev/null || true; }
trap limpiar EXIT INT TERM

echo "==> Preparando la base de datos"
( cd api-php && php sql/seed.php )

echo "==> API PHP        http://127.0.0.1:8080"
( cd api-php && php -S 127.0.0.1:8080 -t public ) &
sleep 2

echo "==> Gateway        http://127.0.0.1:8081"
( cd realtime-node && npm start ) &
sleep 2

echo "==> Agentes simulados"
( cd realtime-node && npm run simulate ) &

echo "==> Interfaz       http://127.0.0.1:5173"
( cd frontend && npm run dev ) &

wait
