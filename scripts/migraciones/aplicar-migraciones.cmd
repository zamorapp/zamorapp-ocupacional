@echo off
rem zamorApp: baja de GitHub las migraciones aprobadas (etiqueta migraciones-*), verifica su SHA-256,
rem muestra la lista y, si escribes S, las aplica en Supabase en una sola transaccion (todo o nada).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0aplicar-migraciones.ps1"
echo.
pause
