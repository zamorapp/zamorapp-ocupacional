# Completa en zamorApp los datos del SAME que faltaron (potencial discapacidad, notas de antecedentes y observación del reposo). Usa la clave guardada del respaldo.
# Uso:  powershell -File scripts\importar-integral\completar-faltantes.ps1 [-Guardar]
# Sin -Guardar es un ensayo: no guarda nada. El informe queda en %USERPROFILE%\.zamorapp\completar-faltantes.md.
param([switch]$Guardar)
$ErrorActionPreference = "Stop"
$credencial = Join-Path $env:USERPROFILE ".zamorapp\respaldo.cred"
if (-not (Test-Path $credencial)) { throw "No encontré la clave del respaldo ($credencial)" }
$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
$argumentos = @((Join-Path $PSScriptRoot "completar-faltantes.mjs"))
if ($Guardar) { $argumentos += "--guardar" }
node @argumentos
exit $LASTEXITCODE
