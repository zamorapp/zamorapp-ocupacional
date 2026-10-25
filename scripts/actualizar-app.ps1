# Compila zamorApp en modo producción y reinicia el servidor local en el puerto 3000.
# Compila aparte (.next-build) y solo reemplaza la versión en uso (.next-prod) si la compilación sale bien,
# así la app nunca queda a medio actualizar.
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$env:NEXT_DIST_DIR = ".next-build"
& npx.cmd next build
if ($LASTEXITCODE -ne 0) { Write-Host "La compilación falló; la app en uso no se tocó." -ForegroundColor Red; exit 1 }

# Detiene el servidor que esté escuchando en el puerto 3000
$conexion = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conexion) { Stop-Process -Id $conexion.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }

if (Test-Path ".next-prod") { Remove-Item ".next-prod" -Recurse -Force }
Rename-Item ".next-build" ".next-prod"

# Arranca en segundo plano, minimizado
Start-Process -FilePath (Join-Path $raiz "abrir-zamorapp.cmd") -ArgumentList "sin-navegador" -WindowStyle Minimized
Write-Host "zamorApp actualizada y en marcha en http://localhost:3000" -ForegroundColor Green
