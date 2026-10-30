# Usa la credencial cifrada del respaldo (DPAPI, solo este usuario de Windows). La clave vive solo en memoria
# de este proceso y se borra al terminar; no se escribe en ningún archivo ni en el registro.
# Las migraciones NO se copian a mano: el .mjs las baja de la etiqueta aprobada y verifica su SHA-256.
$ErrorActionPreference = "Stop"
$carpeta = $PSScriptRoot
$repo = Join-Path $env:USERPROFILE "Documents\zamorapp-ocupacional"
$registro = Join-Path $carpeta "aplicar-migraciones.log"
$segura = Get-Content (Join-Path $carpeta "respaldo.cred") | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
try {
  Push-Location $repo
  Start-Transcript -Path $registro -Append | Out-Null
  & node (Join-Path $carpeta "aplicar-migraciones.mjs")
  $codigo = $LASTEXITCODE
} finally {
  Stop-Transcript | Out-Null
  Pop-Location
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
if ($codigo -eq 0) { Write-Host "`nOK. Avisale a Claude." -ForegroundColor Green }
elseif ($codigo -eq 2) { Write-Host "`nNo se aplico nada (dijiste que no)." -ForegroundColor Yellow }
else { Write-Host "`nNo quedo listo (lee el mensaje de arriba). Avisale a Claude." -ForegroundColor Red }
exit $codigo
