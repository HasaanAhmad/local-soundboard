Local Soundboard — Windows install
=================================

1. Keep this whole folder together (exe + sounds + data + scripts).
2. Double-click LocalSoundboard.exe
3. Browser opens on this PC → choose "Streaming PC"
4. On your phone (same Wi-Fi), open the URL shown on screen → choose "Soundboard"
5. Use the volume slider on PC or phone to set output loudness

Phone app (PWA / Home Screen)
-----------------------------
Port is always 3847. Bookmark/install the same URL once.

iPhone / iPad (Safari):
  Open the board → Share → Add to Home Screen

Android (Chrome):
  Open the board → menu ⋮ → Install app / Add to Home screen

After that, the home-screen icon opens straight into Soundboard.

Auto-start with Windows
-----------------------
Run Install-Startup.bat once. It adds a Startup shortcut.
Run Uninstall-Startup.bat to remove it.

Notes
-----
- Keep the PC awake / not fully sleeping if you want phone triggers anytime.
- Windows Firewall may ask to allow LocalSoundboard on private networks — Allow.
- Sounds and volume settings are saved in the data\ folder next to the exe.
- Tip: reserve your PC's local IP in the router DHCP settings so the phone URL never changes.
