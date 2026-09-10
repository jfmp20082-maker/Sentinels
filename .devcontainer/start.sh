#!/usr/bin/env bash
# Se ejecuta cada vez que te conectas al codespace. Levanta las cuatro piezas
# en segundo plano y devuelve la terminal; los registros van a /tmp.
set -uo pipefail
cd "$(dirname "$0")/.."

# El codigo ya no trae token de servicio por defecto; lo fija aqui y los cuatro
# procesos en segundo plano lo heredan. Es un token de demo del codespace.
export SENTINELA_SERVICE_TOKEN="${SENTINELA_SERVICE_TOKEN:-dev-codespace-$(date +%s)}"

vivo() { curl -sf -o /dev/null --max-time 1 "$1"; }

arrancar() {              # arrancar <nombre> <sonda|-> <comando...>
  local nombre="$1" sonda="$2"; shift 2
  if [ "$sonda" != "-" ] && vivo "$sonda"; then
    echo "    $nombre ya estaba corriendo"
    return
  fi
  nohup "$@" > "/tmp/sentinela-$nombre.log" 2>&1 &
  echo "    $nombre -> /tmp/sentinela-$nombre.log"
}

echo "==> Levantando Sentinela"
arrancar api      http://127.0.0.1:8080/api/health \
  env PHP_CLI_SERVER_WORKERS=4 php -S 0.0.0.0:8080 -t api-php/public
sleep 2
arrancar gateway  http://127.0.0.1:8081/healthz \
  npm --prefix realtime-node start
sleep 2
arrancar agentes  - \
  npm --prefix realtime-node run simulate
arrancar frontend http://127.0.0.1:5173 \
  npm --prefix frontend run dev

cat <<'TXT'

    Interfaz   -> pestaña PORTS, puerto 5173, "Open in Browser"
    Usuario    -> SNT-4417
    Contraseña -> Sentinela#2026
    2FA        -> el propio panel muestra el código vigente

    Detener:  pkill -f 'php -S' ; pkill -f node
    Reiniciar: bash .devcontainer/start.sh

TXT
