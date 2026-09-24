# Novara - MODO REAL: el panel muestra las metricas reales de ESTA maquina.
#
# Levanta las cuatro piezas, cada una en su ventana:
#   API PHP  ->  gateway Node  ->  agente Java (lee este equipo)  ->  interfaz
#
# A diferencia de la demo del navegador (que inventa los datos), aqui el agente
# Java mide CPU, memoria, discos, servicios y puertos REALES y los envia firmados.
#
# Requisitos: PHP, Node y un JDK (java/javac) en el PATH.
# Uso:  powershell -ExecutionPolicy Bypass -File run-real.ps1

$raiz = $PSScriptRoot

# Carga tu conexion privada (Supabase, correo del admin) si existe. Ese archivo
# esta en .gitignore, asi no reescribes la cadena cada vez ni se sube al repo.
if (Test-Path "$raiz\conexion.local.ps1") {
  . "$raiz\conexion.local.ps1"
  Write-Host "==> conexion.local.ps1 cargado."
}

# Token de servicio compartido entre API, gateway y (via base) el agente.
# El codigo ya no trae uno por defecto: hay que fijarlo, y las ventanas hijas
# lo heredan de aqui. Es un valor de desarrollo local.
if (-not $env:SENTINELA_SERVICE_TOKEN) {
  $env:SENTINELA_SERVICE_TOKEN = "real-local-$([int](Get-Date -UFormat %s))"
}

if ($env:SENTINELA_DSN) {
  Write-Host "==> Base remota (SENTINELA_DSN definido): NO se resiembra, se usa lo que ya hay."
} else {
  Write-Host "==> Sembrando la base local SQLite con este equipo (server.id srv-local)"
  Push-Location "$raiz\api-php"
  php sql/seed-local.php
  Pop-Location
}

Write-Host "==> Compilando el agente Java"
Push-Location "$raiz\agent-java"
$fuentes = Get-ChildItem -Recurse -Filter *.java src | ForEach-Object { $_.FullName }
javac -d out $fuentes
Pop-Location

$piezas = @(
  @{ nombre = 'API PHP        http://127.0.0.1:8080'; ruta = "$raiz\api-php";       cmd = 'php -S 127.0.0.1:8080 -t public' },
  @{ nombre = 'Gateway        http://127.0.0.1:8081'; ruta = "$raiz\realtime-node"; cmd = 'npm start' },
  @{ nombre = 'Agente (este equipo)';                 ruta = "$raiz\agent-java";    cmd = 'java -cp out mx.sentinela.agent.Agent agent.properties' }
)

foreach ($p in $piezas) {
  Write-Host "==> $($p.nombre)"
  Start-Process powershell -ArgumentList '-NoExit', '-Command',
    "`$env:SENTINELA_SERVICE_TOKEN='$($env:SENTINELA_SERVICE_TOKEN)'; Set-Location '$($p.ruta)'; $($p.cmd)"
  Start-Sleep -Seconds 2
}

Write-Host "==> Interfaz (modo normal, habla con el backend real)  http://127.0.0.1:5173"
Start-Process powershell -ArgumentList '-NoExit', '-Command',
  "Set-Location '$raiz\frontend'; npm run dev"

Write-Host "`nListo. Abre http://127.0.0.1:5173"
Write-Host "  Usuario : SNT-4417   Contrasena: Sentinela#2026"
Write-Host "  El codigo de acceso (2FA) LLEGA POR CORREO al correo del usuario admin."
Write-Host "  Para que se envie de verdad, copia api-php/mail.local.php.example a"
Write-Host "  api-php/mail.local.php y pon tu Gmail + contrasena de aplicacion de Google."
Write-Host "  Mientras no lo configures, el codigo aparece en la pantalla de acceso"
Write-Host "  (respaldo de desarrollo) y en api-php/data/last-login-code.txt."
Write-Host "  Cerrar todo: cierra las ventanas, o  Get-Process php,node,java | Stop-Process"
