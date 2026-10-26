@echo off
rem Trae a zamorApp lo nuevo del Sistema Integral (respalda antes; el Integral no se modifica)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\importar-integral\actualizar.ps1"
pause
