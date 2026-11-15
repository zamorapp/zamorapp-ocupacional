# Pasa a zamorApp el catálogo completo de diagnósticos y medicinas del SAME (solo lee el SAME). Usa la clave guardada del respaldo.
# Uso:  powershell -File scripts\importar-integral\catalogos-completos.ps1 [-Guardar]
# Sin -Guardar es un ensayo: no guarda nada. El informe queda en %USERPROFILE%\.zamorapp\catalogos-completos.md.
param([switch]$Guardar)
$ErrorActionPreference = "Stop"
$credencial = Join-Path $env:USERPROFILE ".zamorapp\respaldo.cred"
if (-not (Test-Path $credencial)) { throw "No encontré la clave del respaldo ($credencial)" }
$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
$argumentos = @((Join-Path $PSScriptRoot "catalogos-completos.mjs"))
if ($Guardar) { $argumentos += "--guardar" }
node @argumentos
exit $LASTEXITCODE
