# Carga en zamorApp la fecha de ingreso al cargo (antigüedad en el cargo) del SAME, sin pisar lo que ya exista. Usa la clave guardada del respaldo.
# Uso:  powershell -File scripts\importar-integral\cargar-antiguedad-cargo.ps1 [-Guardar]
# Sin -Guardar es un ensayo: no guarda nada. El informe queda en %USERPROFILE%\.zamorapp\antiguedad-cargo.md.
param([switch]$Guardar)
$ErrorActionPreference = "Stop"
$credencial = Join-Path $env:USERPROFILE ".zamorapp\respaldo.cred"
if (-not (Test-Path $credencial)) { throw "No encontré la clave del respaldo ($credencial)" }
$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
$argumentos = @((Join-Path $PSScriptRoot "cargar-antiguedad-cargo.mjs"))
if ($Guardar) { $argumentos += "--guardar" }
node @argumentos
exit $LASTEXITCODE
