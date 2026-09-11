@echo off
rem Abre Novara en MODO REAL (metricas de este equipo). Necesita PHP, Node y Java.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File run-real.ps1
