# Escaneados del SAME (Sistema Integral) → paquete listo para subir a zamorApp desde la app.
# SOLO LEE: SQL Server se consulta con SELECT (conexión de solo lectura, una consulta pequeña a la vez) y
# la carpeta RecCliente se copia, nunca se mueve ni se cambia. No sube nada a internet y no usa claves.
# Antes de cada consulta revisa que la PC tenga al menos 1 GB de memoria libre (si no, se detiene).
#
# Uso (PowerShell, en la PC del SAME):
#   powershell -ExecutionPolicy Bypass -File scripts\importar-integral\escaneados.ps1 [-Carpeta "C:\...\RecCliente"]
# Resultado: %USERPROFILE%\.zamorapp\escaneados-same\ con los archivos (PDF, JPG o PNG), manifiesto.json e informe.txt.
# Después: zamorApp › Configuración › Importar escaneados del SAME › elegir esa carpeta.
param([string]$Carpeta = "C:\Program Files (x86)\MediSoftware\Integral\RecCliente")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$salida = Join-Path $env:USERPROFILE ".zamorapp\escaneados-same"
New-Item -ItemType Directory -Force $salida | Out-Null
$informe = New-Object System.Collections.Generic.List[string]
function Anotar($texto) { Write-Host $texto; $informe.Add($texto) }

function RevisarMemoria {
  $libre = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1KB
  if ($libre -lt 1GB) {
    throw ("Memoria libre {0:N0} MB: hace falta 1 GB. Cierra programas (no el SAME si está en uso) y vuelve a intentarlo." -f ($libre / 1MB))
  }
}

# Conexión de solo lectura con la cuenta de Windows (igual que el SAME); nunca se cambia la configuración del servidor
$conexion = New-Object System.Data.SqlClient.SqlConnection "Server=.;Database=Integral;Integrated Security=True;ApplicationIntent=ReadOnly;Application Name=zamorApp-escaneados"
$conexion.Open()
function Leer([string]$sql, [hashtable]$parametros = @{}) {
  RevisarMemoria
  if ($sql -notmatch '^\s*select\s') { throw "Solo se permiten consultas SELECT." }
  $cmd = $conexion.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 60
  foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
  $tabla = New-Object System.Data.DataTable
  $lector = $cmd.ExecuteReader(); $tabla.Load($lector); $lector.Close()
  return ,$tabla
}

try {
  # ─── 1. Archivos de RecCliente ───────────────────────────────
  if (-not (Test-Path $Carpeta)) { throw "No encuentro la carpeta $Carpeta. Indica la correcta con -Carpeta." }
  $archivos = @(Get-ChildItem $Carpeta -Recurse -File)
  $porNombre = @{}
  foreach ($a in $archivos) { $porNombre[$a.Name.ToLower()] = $a }
  Anotar ("Archivos en RecCliente: {0} ({1:N1} MB)" -f $archivos.Count, (($archivos | Measure-Object Length -Sum).Sum / 1MB))

  # ─── 2. Tablas de documentos digitalizados (…recdig) y sus columnas ───
  $columnas = Leer "select c.TABLE_NAME tabla, c.COLUMN_NAME columna, c.DATA_TYPE tipo from INFORMATION_SCHEMA.COLUMNS c where c.TABLE_SCHEMA = 'Integral' and c.TABLE_NAME like '%recdig%' order by c.TABLE_NAME, c.ORDINAL_POSITION"
  $tablas = $columnas | Group-Object tabla
  foreach ($t in $tablas) { Anotar ("Tabla {0}: {1}" -f $t.Name, (($t.Group | ForEach-Object { "$($_.columna) ($($_.tipo))" }) -join ", ")) }

  # Ingresos → paciente (por si hay documentos de ingreso)
  $ingresoPaciente = @{}
  $tablaIngreso = Leer "select top 1 TABLE_NAME tabla from INFORMATION_SCHEMA.COLUMNS where TABLE_SCHEMA = 'Integral' and TABLE_NAME like 'ingreso%' and TABLE_NAME not like '%recdig%' and COLUMN_NAME = 'cod_paciente'"
  if ($tablaIngreso.Rows.Count) {
    foreach ($f in (Leer ("select cast(codigo as nvarchar(50)) codigo, cast(cod_paciente as nvarchar(50)) cod_paciente from Integral.[{0}]" -f $tablaIngreso.Rows[0].tabla)).Rows) { $ingresoPaciente[$f.codigo] = $f.cod_paciente }
  }

  # Historia → cédula: en zamorApp el paciente se identifica por cédula (varias historias del SAME pueden ser la misma persona)
  $historias = @{}
  foreach ($f in (Leer "select cast(historia as nvarchar(50)) h, cast(cedula as nvarchar(50)) c from Integral.paciente").Rows) { $historias[$f.h] = ([string]$f.c).Trim() }
  $cedulaHistoria = @{}
  foreach ($h in $historias.Keys) { $d = $historias[$h] -replace '\D', ''; if ($d.Length -ge 5) { $cedulaHistoria[$d] = $h } }

  $manifiesto = New-Object System.Collections.Generic.List[object]
  $usados = @{}
  $binarios = 0
  # Lo que queda fuera, por motivo: el resumen final se lo dice a Cesar (y queda en informe.txt)
  $fuera = [ordered]@{ "pesa más de 10 MB" = 0; "no es PDF ni imagen" = 0; "imagen dañada" = 0; "sin paciente" = 0; "sin archivo (ni en RecCliente ni en la base)" = 0; "sin dueño en RecCliente" = 0 }
  $porNombre_ = 0

  function Guardar($origen, $bytesOArchivo, $nombreOriginal, $paciente, $consulta, $fecha, $descripcion) {
    $ext = [IO.Path]::GetExtension($nombreOriginal).ToLower()
    $base = ($origen -replace '[^\w-]+', '_')
    $salidas = @()
    if ($ext -eq ".pdf") {
      $destino = Join-Path $salida "$base.pdf"
      if ($bytesOArchivo -is [byte[]]) { [IO.File]::WriteAllBytes($destino, $bytesOArchivo) } else { Copy-Item $bytesOArchivo.FullName $destino }
      $salidas += $destino
    } elseif ($ext -in @(".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".gif")) {
      # Imágenes: se pasan a JPG (las de varias páginas, una por página). La base solo acepta PDF, JPG o PNG.
      if ($bytesOArchivo -is [byte[]]) { $flujo = New-Object IO.MemoryStream (,$bytesOArchivo) } else { $flujo = [IO.File]::OpenRead($bytesOArchivo.FullName) }
      try {
        try { $img = [System.Drawing.Image]::FromStream($flujo) } catch {
          $fuera["imagen dañada"]++; Anotar "  IMAGEN DAÑADA: $nombreOriginal (no se pudo leer; queda solo en el SAME)"; return
        }
        $paginas = 1
        try { $paginas = $img.GetFrameCount([System.Drawing.Imaging.FrameDimension]::Page) } catch { }
        for ($p = 0; $p -lt $paginas; $p++) {
          if ($paginas -gt 1) { [void]$img.SelectActiveFrame([System.Drawing.Imaging.FrameDimension]::Page, $p) }
          $lienzo = New-Object System.Drawing.Bitmap $img.Width, $img.Height
          $g = [System.Drawing.Graphics]::FromImage($lienzo); $g.Clear([System.Drawing.Color]::White); $g.DrawImage($img, 0, 0, $img.Width, $img.Height); $g.Dispose()
          $sufijo = ""; if ($paginas -gt 1) { $sufijo = "-p$($p + 1)" }
          $destino = Join-Path $salida "$base$sufijo.jpg"
          $lienzo.Save($destino, [System.Drawing.Imaging.ImageFormat]::Jpeg); $lienzo.Dispose()
          $salidas += $destino
        }
        $img.Dispose()
      } finally { $flujo.Dispose() }
    } else {
      $fuera["no es PDF ni imagen"]++
      Anotar "  NO SE PUEDE: $nombreOriginal ($ext no es PDF ni imagen). Queda solo en el SAME."
      return
    }
    $i = 0
    foreach ($s in $salidas) {
      $i++
      $clave = $origen; if ($salidas.Count -gt 1) { $clave = "$origen#$i" }
      if ((Get-Item $s).Length -gt 10MB) { $fuera["pesa más de 10 MB"]++; Anotar "  PESA MÁS DE 10 MB: $s (no se subirá)"; continue }
      $historia = $paciente -replace '^pac:', ''
      $manifiesto.Add([ordered]@{ archivo = (Split-Path $s -Leaf); original = $nombreOriginal; origen = $clave; paciente = $paciente; cedula = $historias[$historia]; consulta = $consulta; fecha = $fecha; descripcion = $descripcion })
    }
  }

  # ─── 3. Filas de cada tabla …recdig: dueño (consulta, paciente o ingreso) y archivo ───
  foreach ($t in $tablas) {
    $cols = $t.Group
    $texto = @($cols | Where-Object { $_.tipo -notin @("image", "varbinary", "binary", "timestamp") })
    $blob = @($cols | Where-Object { $_.tipo -in @("image", "varbinary") }) | Select-Object -First 1
    $lista = ($texto | ForEach-Object { "cast([{0}] as nvarchar(4000)) [{0}]" -f $_.columna }) -join ", "
    $filas = Leer ("select {0} from Integral.[{1}]" -f $lista, $t.Name)
    $clavePrimaria = @($texto | Where-Object { $_.columna -in @("codigo", "id") } | Select-Object -First 1)
    Anotar ("{0}: {1} filas" -f $t.Name, $filas.Rows.Count)
    foreach ($f in $filas.Rows) {
      $consulta = $null; $paciente = $null; $fecha = $null; $descripcion = $null; $archivo = $null
      foreach ($c in $texto) {
        $v = [string]$f[$c.columna]
        if (-not $v) { continue }
        $n = $c.columna.ToLower()
        if ($n -eq "cod_consulta") { $consulta = $v }
        elseif ($n -in @("cod_paciente", "historia")) { $paciente = $v }
        elseif ($n -eq "cod_ingreso" -and $ingresoPaciente.ContainsKey($v)) { $paciente = $ingresoPaciente[$v] }
        elseif ($n -like "fecha*" -and -not $fecha) { $fecha = $v }
        elseif ($n -in @("nombre", "descripcion", "observacion", "titulo") -and -not $descripcion) { $descripcion = $v }
        $hoja = (Split-Path $v -Leaf).ToLower()
        if (-not $archivo -and $porNombre.ContainsKey($hoja)) { $archivo = $porNombre[$hoja] }
      }
      if ($consulta -and -not $paciente) {
        $r = Leer "select cast(cod_paciente as nvarchar(50)) p, convert(nvarchar(10), fecha, 23) f from Integral.consulta where cast(codigo as nvarchar(50)) = @c" @{ "@c" = $consulta }
        if ($r.Rows.Count) { $paciente = $r.Rows[0].p; if (-not $fecha) { $fecha = $r.Rows[0].f } }
      }
      $id = ""; if ($clavePrimaria.Count) { $id = [string]$f[$clavePrimaria[0].columna] }
      $origen = "{0}:{1}" -f $t.Name, $id
      if (-not $paciente) { $fuera["sin paciente"]++; Anotar "  SIN PACIENTE: $origen"; continue }
      $pac = "pac:$paciente"; $con = $null; if ($consulta) { $con = "cons:$consulta" }
      if ($archivo) {
        $usados[$archivo.FullName] = $true
        Guardar $origen $archivo $archivo.Name $pac $con $fecha $descripcion
      } elseif ($blob -and $clavePrimaria.Count) {
        # El documento está guardado dentro de la base: se lee esa fila sola (una a la vez)
        $r = Leer ("select [{0}] b from Integral.[{1}] where cast([{2}] as nvarchar(4000)) = @id" -f $blob.columna, $t.Name, $clavePrimaria[0].columna) @{ "@id" = $id }
        if ($r.Rows.Count -and $r.Rows[0].b -is [byte[]]) {
          $bytes = [byte[]]$r.Rows[0].b; $binarios++
          $ext = ".jpg"
          if ($bytes.Length -gt 4 -and $bytes[0] -eq 0x25 -and $bytes[1] -eq 0x50) { $ext = ".pdf" }
          Guardar $origen $bytes "$origen$ext" $pac $con $fecha $descripcion
        } else { $fuera["sin archivo (ni en RecCliente ni en la base)"]++; Anotar "  SIN ARCHIVO: $origen" }
      } else { $fuera["sin archivo (ni en RecCliente ni en la base)"]++; Anotar "  SIN ARCHIVO: $origen" }
    }
  }

  # ─── 4. Archivos de RecCliente que ninguna tabla nombra: se intenta por el número de historia o la cédula en el nombre ───
  foreach ($a in $archivos) {
    if ($usados.ContainsKey($a.FullName)) { continue }
    $carpetaPadre = Split-Path (Split-Path $a.FullName -Parent) -Leaf
    $candidatos = @([regex]::Matches("$carpetaPadre $($a.BaseName)", '\d+') | ForEach-Object { $_.Value } | ForEach-Object { if ($historias.ContainsKey($_)) { $_ } elseif ($cedulaHistoria.ContainsKey($_)) { $cedulaHistoria[$_] } } | Select-Object -Unique)
    if ($candidatos.Count -eq 1) {
      Guardar ("RecCliente:" + $a.FullName.Substring($Carpeta.Length).TrimStart('\')) $a $a.Name "pac:$($candidatos[0])" $null ($a.LastWriteTime.ToString("yyyy-MM-dd")) $null
      $porNombre_++
      Anotar "  POR NOMBRE: $($a.Name) → historia $($candidatos[0]) (revisar al subir)"
    } else {
      $fuera["sin dueño en RecCliente"]++
      Anotar "  SIN DUEÑO: $($a.FullName) (queda solo en el SAME; avisar)"
    }
  }

  ConvertTo-Json -InputObject @($manifiesto.ToArray()) -Depth 3 | Set-Content (Join-Path $salida "manifiesto.json") -Encoding UTF8
  Anotar ("Listos para subir: {0} archivos ({1} leídos de la base). Carpeta: {2}" -f $manifiesto.Count, $binarios, $salida)
  if ($porNombre_) { Anotar ("Ligados por el nombre del archivo (revisar al subir): {0}" -f $porNombre_) }
  $totalFuera = ($fuera.Values | Measure-Object -Sum).Sum
  Anotar ("QUEDARON FUERA: {0} (siguen en el SAME, que no se toca)" -f $totalFuera)
  foreach ($k in $fuera.Keys) { if ($fuera[$k]) { Anotar ("  - {0}: {1}" -f $k, $fuera[$k]) } }
  if ($totalFuera) { Anotar "  El detalle de cada uno está arriba en este informe. Los TIFF y BMP no quedan fuera: se pasan a JPG." }
} finally {
  $conexion.Close()
  $informe | Set-Content (Join-Path $salida "informe.txt") -Encoding UTF8
}
