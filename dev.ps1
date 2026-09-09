# Levanta las cuatro piezas del prototipo, cada una en su propia ventana.
$raiz = $PSScriptRoot

Write-Host "==> Preparando la base de datos"
Push-Location "$raiz\api-php"; php sql/seed.php; Pop-Location

$piezas = @(
  @{ nombre = 'API PHP        http://127.0.0.1:8080'; ruta = "$raiz\api-php";      cmd = 'php -S 127.0.0.1:8080 -t public' },
  @{ nombre = 'Gateway        http://127.0.0.1:8081'; ruta = "$raiz\realtime-node"; cmd = 'npm start' },
  @{ nombre = 'Agentes simulados';                    ruta = "$raiz\realtime-node"; cmd = 'npm run simulate' },
  @{ nombre = 'Interfaz       http://127.0.0.1:5173'; ruta = "$raiz\frontend";      cmd = 'npm run dev' }
)

foreach ($p in $piezas) {
  Write-Host "==> $($p.nombre)"
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$($p.ruta)'; $($p.cmd)"
  Start-Sleep -Seconds 2
}

Write-Host "`nListo. Abre http://127.0.0.1:5173"
