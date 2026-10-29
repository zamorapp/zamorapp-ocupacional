# Cuadre de los reportes con el SAME (solo lectura en los dos lados). Usa la clave guardada del respaldo.
# Uso:  powershell -File scripts\cuadre-same\cuadre.ps1 [-Desde 2015-01-01] [-Hasta 2026-10-24]
# El informe queda en %USERPROFILE%\.zamorapp\cuadre-same-<hasta>.md (solo cifras).
param([string]$Desde = "2015-01-01", [string]$Hasta = "2026-10-24")
$ErrorActionPreference = "Stop"
$credencial = Join-Path $env:USERPROFILE ".zamorapp\respaldo.cred"
if (-not (Test-Path $credencial)) { throw "No encontré la clave del respaldo ($credencial)" }
$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
node (Join-Path $PSScriptRoot "cuadre.mjs") $Desde $Hasta
exit $LASTEXITCODE
