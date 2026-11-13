@echo off
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LocalSoundboard.lnk"
if exist "%LINK%" del "%LINK%"
echo Removed from Windows Startup.
pause
