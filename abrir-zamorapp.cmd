@echo off
title zamorApp Ocupacional
cd /d "%~dp0"
rem Si ya esta corriendo, solo abre el navegador
powershell -NoProfile -Command "if ((New-Object Net.Sockets.TcpClient).ConnectAsync('127.0.0.1',3000).Wait(1500)) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  start "" http://localhost:3000
  exit /b
)
echo Iniciando zamorApp Ocupacional... no cierres esta ventana mientras uses la app.
start "" /min powershell -NoProfile -Command "Start-Sleep 8; Start-Process http://localhost:3000"
call npm.cmd run dev
