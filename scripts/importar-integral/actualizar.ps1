# Trae a zamorApp lo nuevo o cambiado del Sistema Integral. El Integral solo se lee.
# Antes respalda zamorApp (scripts\respaldo.ps1). Usa la clave guardada por "respaldo.ps1 -Configurar".
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $raiz
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts\respaldo.ps1
$segura = Get-Content (Join-Path $env:LOCALAPPDATA "zamorApp\respaldo.cred") | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
& node scripts\importar-integral\cargar.mjs
