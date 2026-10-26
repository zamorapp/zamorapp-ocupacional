# Exporta datos del Sistema Integral (SQL Server local) a archivos en esta PC. No sube nada a internet.
# Uso:  powershell -File scripts\importar-integral\exportar.ps1 [-Etapa catalogos|historial]
#   catalogos: diagnósticos (con cuántas veces se usaron), medicinas, tratamientos usados, empresas, dependencias
#   historial: pacientes, consultas, diagnósticos por consulta (datos de salud: quedan solo en la PC)
param([ValidateSet("catalogos", "historial")][string]$Etapa = "catalogos")
$ErrorActionPreference = "Stop"
$carpeta = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "zamorApp Importacion\integral\$Etapa"
New-Item -ItemType Directory -Force $carpeta | Out-Null

$consultas = @{}
if ($Etapa -eq "catalogos") {
  $consultas = @{
    "diagnosticos" = "select d.codigo, d.categoria, d.nombre, d.codstatus, (select count(*) from Integral.consultadiagnostico cd where cd.cod_diagnost = d.codigo) as usos from Integral.diagnostico d"
    "medicinas"    = "select m.codigo, m.nombre, m.laboratorio, replace(replace(replace(cast(m.composicion as varchar(2000)), char(13), ' '), char(10), ' '), '|', '/') composicion, replace(replace(replace(cast(m.posologia as varchar(2000)), char(13), ' '), char(10), ' '), '|', '/') posologia, replace(replace(replace(cast(m.presentaciones as varchar(2000)), char(13), ' '), char(10), ' '), '|', '/') presentaciones, (select count(*) from Integral.tratamiento t where t.cod_medicina = m.codigo) as usos from Integral.medicina m"
    "tratamientos" = "select * from Integral.tratamiento"
    "empresas"     = "select codigo, rif, nombre, direccion, telf01, telf02, contacto, codstatus from Integral.empresa"
    "dependencias" = "select cod_empresa, codigo, nombre, descripcion from Integral.dependencia"
  }
} else {
  $consultas = @{
    "pacientes"            = "select * from Integral.paciente"
    "consultas"            = "select * from Integral.consulta"
    "consulta_diagnosticos" = "select * from Integral.consultadiagnostico"
  }
}

foreach ($nombre in $consultas.Keys) {
  $archivo = Join-Path $carpeta "$nombre.csv"
  # Con encabezados (fila 1) y la línea de guiones (fila 2) que se descarta; -u = Unicode para no perder acentos
  sqlcmd -S . -E -d Integral -W -s "|" -u -Q ("SET NOCOUNT ON; " + $consultas[$nombre]) -o "$archivo.tmp"
  if ($LASTEXITCODE -ne 0) { throw "Falló la exportación de $nombre" }
  $lineas = Get-Content "$archivo.tmp" -Encoding Unicode
  @($lineas[0]) + ($lineas | Select-Object -Skip 2) | Set-Content $archivo -Encoding UTF8
  Remove-Item "$archivo.tmp"
  Write-Host ("{0,-24} {1,7} filas" -f $nombre, ($lineas.Count - 2))
}
Write-Host "Archivos en: $carpeta" -ForegroundColor Green
