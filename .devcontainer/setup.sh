#!/usr/bin/env bash
# Se ejecuta UNA vez, al crear el codespace: dependencias y base de datos.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Comprobando pdo_sqlite"
if ! php -m | grep -qi '^pdo_sqlite$'; then
  echo "    falta; instalando php8.3-sqlite3"
  sudo apt-get update -qq && sudo apt-get install -y -qq php8.3-sqlite3
fi

echo "==> Dependencias del gateway"
( cd realtime-node && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) )

echo "==> Dependencias de la interfaz"
( cd frontend && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) )

echo "==> Sembrando la base"
( cd api-php && php sql/seed.php )

# Habilita GET /api/demo/totp: sin el, no hay forma de pasar el segundo factor
# sin registrar el secreto en una app de autenticacion. Es un codespace de
# demostracion; en un despliegue real este fichero no debe existir.
touch api-php/data/DEMO

echo "==> Listo. Al abrir una terminal se levantan los cuatro procesos."
