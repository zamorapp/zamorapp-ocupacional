@echo off
title zamorApp Ocupacional
cd /d "%~dp0"
rem Si ya esta corriendo, solo abre el navegador
powershell -NoProfile -Command "try { if ((New-Object Net.Sockets.TcpClient).ConnectAsync('127.0.0.1',3000).Wait(1500)) { exit 0 } } catch {}; exit 1"
if %errorlevel%==0 (
  if not "%1"=="sin-navegador" start "" http://localhost:3000
  exit /b
)
rem Primera vez: compila la version de produccion
if not exist ".next-prod" (
  echo Preparando zamorApp por primera vez, espera un momento...
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizar-app.ps1
  if not "%1"=="sin-navegador" start "" http://localhost:3000
  exit /b
)
rem Arranca el servidor oculto, sin ventana que se pueda cerrar por error
set NEXT_DIST_DIR=.next-prod
powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c npx.cmd next start -p 3000 -H 127.0.0.1' -WindowStyle Hidden"
if not "%1"=="sin-navegador" start "" /min powershell -NoProfile -Command "Start-Sleep 5; Start-Process http://localhost:3000"
