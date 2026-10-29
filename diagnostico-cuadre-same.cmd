@echo off
rem Diagnóstico del cuadre con el SAME: SOLO LECTURA (no cambia nada en SQL Server ni en zamorApp).
rem Correr al cerrar la jornada, con el SAME cerrado o en reposo. Lee el SAME en 7 consultas pequeñas, una a la vez,
rem y solo si la PC tiene 1 GB de memoria libre. El resultado (solo cifras) queda en %USERPROFILE%\.zamorapp\
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\cuadre-same\diagnostico.ps1
echo.
echo Listo. Archivo: %USERPROFILE%\.zamorapp\diagnostico-cuadre-2026-10-24.md
pause
