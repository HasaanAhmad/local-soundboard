@echo off
:: Adds a Windows Firewall allow rule for Local Soundboard (port 3847).
net session >nul 2>&1
if errorlevel 1 (
  echo Right-click this file → Run as administrator
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Local Soundboard" >nul 2>&1
netsh advfirewall firewall add rule name="Local Soundboard" dir=in action=allow protocol=TCP localport=3847 profile=private,domain
echo Allowed TCP 3847 on Private networks.
pause
