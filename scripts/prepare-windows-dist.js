const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const win = path.join(root, "windows");

fs.mkdirSync(dist, { recursive: true });

for (const name of ["Install-Startup.bat", "Uninstall-Startup.bat", "Start-Hidden.vbs", "README-WINDOWS.txt"]) {
  const from = path.join(win, name);
  const to = path.join(dist, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
}

const sounds = path.join(dist, "sounds");
const data = path.join(dist, "data");
fs.mkdirSync(sounds, { recursive: true });
fs.mkdirSync(data, { recursive: true });

const srcSounds = path.join(root, "sounds");
if (fs.existsSync(srcSounds)) {
  for (const file of fs.readdirSync(srcSounds)) {
    if (file.startsWith(".")) continue;
    fs.copyFileSync(path.join(srcSounds, file), path.join(sounds, file));
  }
}

const manifestSrc = path.join(root, "data", "sounds.json");
const manifestDest = path.join(data, "sounds.json");
if (fs.existsSync(manifestSrc) && !fs.existsSync(manifestDest)) {
  fs.copyFileSync(manifestSrc, manifestDest);
} else if (!fs.existsSync(manifestDest)) {
  fs.writeFileSync(manifestDest, "[]");
}

console.log("Windows dist ready in ./dist");
console.log("Copy the whole dist folder to your Windows PC and run LocalSoundboard.exe");
