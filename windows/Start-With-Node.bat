@echo off
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org then re-run.
  pause
  exit /b 1
)
if not exist "node_modules\" npm install
node server.js
pause
