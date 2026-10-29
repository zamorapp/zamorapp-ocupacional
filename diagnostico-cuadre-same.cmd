@echo off
rem Diagnóstico del cuadre con el SAME: SOLO LECTURA (no cambia nada en SQL Server ni en zamorApp).
rem Correr al cerrar la jornada, con el SAME cerrado o en reposo. Lee el SAME en 7 consultas pequeñas, una a la vez,
rem y solo si la PC tiene 1 GB de memoria libre. El resultado (solo cifras) queda en %USERPROFILE%\.zamorapp\
rem Uso: diagnostico-cuadre-same.cmd [desde AAAA-MM-DD] [hasta AAAA-MM-DD]   (por defecto 2015-01-01 a 2026-10-24)
setlocal
set "DESDE=%~1"
set "HASTA=%~2"
if "%DESDE%"=="" set "DESDE=2015-01-01"
if "%HASTA%"=="" set "HASTA=2026-10-24"
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\cuadre-same\diagnostico.ps1 -Desde %DESDE% -Hasta %HASTA%
echo.
if exist "%USERPROFILE%\.zamorapp\diagnostico-cuadre-%HASTA%.md" (echo Listo. Archivo: %USERPROFILE%\.zamorapp\diagnostico-cuadre-%HASTA%.md) else (echo No se genero el informe: revise el mensaje de arriba.)
pause
