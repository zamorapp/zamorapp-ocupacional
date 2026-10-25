# Publica zamorApp en Vercel: enlaza el proyecto, carga las variables públicas de Supabase
# y despliega a producción. Requiere haber iniciado sesión antes con:  npx vercel login
$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$vercel = @("--yes", "vercel@48.2.9")

if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "Enlazando el proyecto..." -ForegroundColor Cyan
  & npx.cmd @vercel link --yes --project zamorapp-ocupacional
}

Write-Host "Cargando variables de Supabase (producción)..." -ForegroundColor Cyan
$variables = @{}
foreach ($linea in Get-Content ".env.local") {
  if ($linea -match "^\s*([A-Z_]+)\s*=\s*(.+)\s*$") { $variables[$Matches[1]] = $Matches[2] }
}
foreach ($nombre in @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
  $variables[$nombre] | & npx.cmd @vercel env add $nombre production --force
}

Write-Host "Publicando en producción..." -ForegroundColor Cyan
& npx.cmd @vercel deploy --prod --yes
Write-Host "LISTO-PUBLICACION" -ForegroundColor Green
