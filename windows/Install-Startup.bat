@echo off
setlocal
set "VBS=%~dp0Start-Hidden.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\LocalSoundboard.lnk"

if not exist "%VBS%" (
  echo Start-Hidden.vbs not found next to this script.
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LINK%'); $s.TargetPath = '%VBS%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Description = 'Local Soundboard host'; $s.Save()"

echo Installed. Soundboard will start with Windows.
echo Shortcut: %LINK%
pause
