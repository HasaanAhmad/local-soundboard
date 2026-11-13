@echo off
setlocal
cd /d "%~dp0"

if not exist "runtime\node.exe" (
  echo Missing runtime\node.exe
  echo Re-copy the full LocalSoundboard folder from the zip.
  pause
  exit /b 1
)

echo Starting Local Soundboard...
echo Keep this window open while streaming.
echo.
"runtime\node.exe" server.js
echo.
echo Soundboard stopped.
pause
