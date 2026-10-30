# Recupera los reposos que la falla del 30-oct borró al guardar (los toma de la bitácora). Usa la clave guardada del respaldo.
# Uso:  powershell -File scripts\reparar\recuperar-reposos.ps1 [-Guardar]
# Sin -Guardar es un ensayo: no guarda nada. El informe queda en %USERPROFILE%\.zamorapp\recuperar-reposos.md.
param([switch]$Guardar)
$ErrorActionPreference = "Stop"
$credencial = Join-Path $env:USERPROFILE ".zamorapp\respaldo.cred"
if (-not (Test-Path $credencial)) { throw "No encontré la clave del respaldo ($credencial)" }
$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
$argumentos = @((Join-Path $PSScriptRoot "recuperar-reposos.mjs"))
if ($Guardar) { $argumentos += "--guardar" }
node @argumentos
exit $LASTEXITCODE
