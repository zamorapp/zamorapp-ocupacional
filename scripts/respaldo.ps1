# Respaldo diario de zamorApp: copia los datos de Supabase a la PC y a Google Drive.
# Primera vez (guarda la clave de la base cifrada para este usuario de Windows):
#   $env:PGPW = "<clave de la base>"; powershell -File scripts\respaldo.ps1 -Configurar
# Programar el respaldo diario en Windows:  powershell -File scripts\respaldo.ps1 -Programar (luego se mantiene sola)
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

# Tarea oculta: wscript lanza el respaldo sin ventana (powershell.exe directo abre una consola en Windows Terminal).
# Al iniciar sesión espera 2 minutos para que Google Drive ya esté montado.
function Registrar-Tarea {
  $accion = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$(Join-Path $PSScriptRoot 'respaldo-oculto.vbs')`""
  $alIniciar = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $alIniciar.Delay = "PT2M"
  $disparadores = @((New-ScheduledTaskTrigger -Daily -At "12:30"), $alIniciar)
  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName "zamorApp respaldo" -Action $accion -Trigger $disparadores -Settings $ajustes -Force | Out-Null
}

if ($Programar) {
  Registrar-Tarea
  Write-Host "Respaldo diario programado (12:30 y 2 minutos después de iniciar sesión, sin ventanas)." -ForegroundColor Green
} else {
  # Se repara sola: si la tarea quedó con la acción vieja (powershell.exe con ventana) o sin la espera al iniciar,
  # cada respaldo la vuelve a registrar bien, sin que haga falta el doble clic en programar-respaldo.cmd
  $tarea = Get-ScheduledTask -TaskName "zamorApp respaldo" -ErrorAction SilentlyContinue
  $vieja = $tarea -and ($tarea.Actions[0].Execute -ne "wscript.exe" -or
    -not ($tarea.Triggers | Where-Object { $_.CimClass.CimClassName -eq "MSFT_TaskLogonTrigger" -and $_.Delay -eq "PT2M" }))
  if ($vieja) {
    try { Registrar-Tarea; "$(Get-Date -Format 'yyyy-MM-dd HH:mm') Tarea del respaldo actualizada (oculta, con espera al iniciar)" | Add-Content $registro }
    catch { "$(Get-Date -Format 'yyyy-MM-dd HH:mm') AVISO: no pude actualizar la tarea del respaldo: $_" | Add-Content $registro }
  }
}

$segura = Get-Content $credencial | ConvertTo-SecureString
$env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
$destinos = @(Join-Path ([Environment]::GetFolderPath("MyDocuments")) "zamorApp Respaldos")
# Copia externa en Google Drive para escritorio, en cualquier letra (G:, H:…). Con varias cuentas montadas se usa la
# unidad que ya tiene la carpeta zamorApp. Recién encendida la PC, Drive tarda en montar: se espera hasta 5 minutos.
function Buscar-Drive([switch]$CualquieraSirve) {
  $raices = @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { "$($_.Root)Mi unidad", "$($_.Root)My Drive" } | Where-Object { Test-Path $_ })
  $conCarpeta = $raices | Where-Object { Test-Path (Join-Path $_ "zamorApp") } | Select-Object -First 1
  if ($conCarpeta) { return $conCarpeta }
  if ($CualquieraSirve) { return $raices | Select-Object -First 1 }
}
$drive = Buscar-Drive
for ($i = 0; -not $drive -and $i -lt 10; $i++) { Start-Sleep -Seconds 30; $drive = Buscar-Drive }
if (-not $drive) { $drive = Buscar-Drive -CualquieraSirve }
if ($drive) { $destinos += Join-Path $drive "zamorApp\respaldos-zamorApp" }
else { "$(Get-Date -Format 'yyyy-MM-dd HH:mm') AVISO: no encontré Google Drive tras esperar 5 minutos; el respaldo quedó solo en la PC y subirá a Drive en el próximo respaldo" | Add-Content $registro }

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

# Archivos (PDF y escaneados del Storage): solo lo nuevo, en «archivos» dentro de las mismas carpetas. Si falla, queda
# anotado (el Inicio avisa) pero no tumba el respaldo de la base, que ya quedó guardado.
$archivos = & node scripts\respaldo-archivos.mjs @destinos 2>$errores
if ($LASTEXITCODE -ne 0) { $archivos = "FALLÓ el respaldo de archivos: $archivos $((Get-Content $errores -ErrorAction SilentlyContinue) -join ' ')" }
"$(Get-Date -Format 'yyyy-MM-dd HH:mm') $archivos" | Add-Content $registro
Write-Host $archivos

# Prueba de restauración semanal: el último respaldo se restaura en una base temporal con el PostgreSQL portátil de
# zamorApp Escritorio (otro puerto, solo 127.0.0.1; no toca la base del programa ni el SAME) y se borra al terminar.
# Con poca memoria libre se pospone y se intenta en el próximo respaldo. El resultado se ve en el Inicio.
$marca = Join-Path $carpeta "ultima-restauracion.txt"
$vencida = -not (Test-Path $marca) -or ((Get-Item $marca).LastWriteTime -lt (Get-Date).AddDays(-7))
if ($vencida) {
  $instalado = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "zamorApp Escritorio*" } | Select-Object -First 1 -ExpandProperty InstallLocation -ErrorAction SilentlyContinue
  $pgBin = @($instalado, (Join-Path $env:LOCALAPPDATA "zamorApp Escritorio"), (Join-Path $env:ProgramFiles "zamorApp Escritorio")) |
    Where-Object { $_ } | ForEach-Object { Join-Path ($_.Trim('"')) "recursos\pgsql\bin" } |
    Where-Object { Test-Path (Join-Path $_ "initdb.exe") } | Select-Object -First 1
  $ultimo = Get-ChildItem $destinos[0] -Filter "respaldo-*.json.gz" | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $pgBin) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm') AVISO: no probé la restauración porque no encontré zamorApp Escritorio instalado" | Add-Content $registro
  } elseif ($ultimo) {
    $env:ZAMORAPP_PG_BIN = $pgBin
    $prueba = & node scripts\probar-restauracion.mjs $ultimo.FullName (Join-Path $carpeta "prueba-restauracion") 2>$errores
    $codigoPrueba = $LASTEXITCODE
    if ($codigoPrueba -ne 0 -and $codigoPrueba -ne 3) { $prueba = "$prueba $((Get-Content $errores -ErrorAction SilentlyContinue) -join ' ')" }
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $prueba" | Add-Content $registro
    Write-Host $prueba
    # Solo un resultado (bueno o malo) cuenta como hecha; si se pospuso, se reintenta en el próximo respaldo
    if ($codigoPrueba -ne 3) { Set-Content $marca (Get-Date -Format "yyyy-MM-dd HH:mm") }
  }
}
