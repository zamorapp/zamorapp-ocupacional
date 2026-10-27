# Respaldo diario de zamorApp: copia los datos de Supabase a la PC y a Google Drive.
# Primera vez (guarda la clave de la base cifrada para este usuario de Windows):
#   $env:PGPW = "<clave de la base>"; powershell -File scripts\respaldo.ps1 -Configurar
# Programar el respaldo diario en Windows:  powershell -File scripts\respaldo.ps1 -Programar
# Respaldo manual en cualquier momento:     powershell -File scripts\respaldo.ps1
param([switch]$Configurar, [switch]$Programar)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
# En la carpeta del usuario y no en AppData: Windows aísla AppData para los programas empaquetados,
# y la tarea programada no vería la clave guardada desde uno de ellos.
$carpeta = Join-Path $env:USERPROFILE ".zamorapp"
$credencial = Join-Path $carpeta "respaldo.cred"
$registro = Join-Path $carpeta "respaldo.log"
New-Item -ItemType Directory -Force $carpeta | Out-Null
# Cualquier error (clave ausente, sin internet…) queda en el registro y la tarea termina con código de falla
trap { "$(Get-Date -Format 'yyyy-MM-dd HH:mm') FALLÓ el respaldo: $_" | Add-Content $registro; exit 1 }

if ($Configurar) {
  if (-not $env:PGPW) { throw "Define primero `$env:PGPW con la clave de la base" }
  $url = "postgresql://postgres.xgsoryzvyrsddgkxkzeb:$([uri]::EscapeDataString($env:PGPW))@aws-1-us-west-2.pooler.supabase.com:6543/postgres"
  New-Item -ItemType Directory -Force (Split-Path $credencial) | Out-Null
  ConvertTo-SecureString $url -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $credencial
  Write-Host "Clave guardada." -ForegroundColor Green
}

if ($Programar) {
  # Por wscript: powershell.exe directo deja ver un cuadro negro un instante al iniciar la PC
  $accion = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$(Join-Path $PSScriptRoot 'respaldo-oculto.vbs')`""
  $disparadores = @((New-ScheduledTaskTrigger -Daily -At "12:30"), (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME))
  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName "zamorApp respaldo" -Action $accion -Trigger $disparadores -Settings $ajustes -Force | Out-Null
  Write-Host "Respaldo diario programado (12:30 y al iniciar sesión)." -ForegroundColor Green
}

$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
$destinos = @(Join-Path ([Environment]::GetFolderPath("MyDocuments")) "zamorApp Respaldos")
# Copia externa en Google Drive para escritorio (unidad «Mi unidad» o «My Drive» en cualquier letra)
$drive = Get-PSDrive -PSProvider FileSystem | ForEach-Object { "$($_.Root)Mi unidad", "$($_.Root)My Drive" } | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($drive) { $destinos += Join-Path $drive "zamorApp\respaldos-zamorApp" }
else { "$(Get-Date -Format 'yyyy-MM-dd HH:mm') AVISO: no encontré Google Drive; el respaldo quedó solo en la PC" | Add-Content $registro }

Set-Location $raiz
# La salida de error de node se lee aparte: con ErrorActionPreference=Stop, «2>&1» la convierte en excepción
$ErrorActionPreference = "Continue"
$errores = Join-Path $carpeta "respaldo-error.txt"
$salida = & node scripts\respaldo.mjs @destinos 2>$errores
$codigo = $LASTEXITCODE
if ($codigo -ne 0) {
  $salida = "$salida $((Get-Content $errores -ErrorAction SilentlyContinue) -join ' ')"
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') FALLÓ el respaldo (código $codigo): $salida" | Add-Content $registro
  Write-Host "FALLÓ el respaldo (código $codigo): $salida" -ForegroundColor Red
  exit $codigo
}
"$(Get-Date -Format 'yyyy-MM-dd HH:mm') $salida" | Add-Content $registro
Write-Host $salida
