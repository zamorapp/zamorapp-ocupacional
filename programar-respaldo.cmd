@echo off
rem Programa en Windows el respaldo diario de zamorApp (12:30 y al iniciar sesion).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\respaldo.ps1" -Programar
pause
