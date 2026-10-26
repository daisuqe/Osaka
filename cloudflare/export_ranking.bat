@echo off
rem Double-click to save the online ranking (Cloudflare D1) as a CSV file in ..\ranking_backup
rem Needs Node.js. The first time, run "npx wrangler login" once (a browser opens) and put database_id in wrangler.toml.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0export_ranking.ps1"
echo.
pause
