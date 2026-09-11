@echo off
rem Abre Novara en MODO DEMO (datos simulados, solo navegador).
cd /d "%~dp0frontend"
start "" powershell -WindowStyle Hidden -Command "Start-Sleep 4; Start-Process http://localhost:5173"
npm run dev:demo
