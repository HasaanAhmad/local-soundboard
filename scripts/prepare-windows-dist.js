const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const win = path.join(root, "windows");
const cacheDir = path.join(root, ".cache");
const NODE_VERSION = "v22.23.5";
const NODE_ZIP = `node-${NODE_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_ZIP}`;

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode} ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {
          /* ignore */
        }
        reject(err);
      });
  });
}

async function ensureNodeRuntime() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, NODE_ZIP);
  const extractDir = path.join(cacheDir, `node-${NODE_VERSION}-win-x64`);
  const cachedExe = path.join(extractDir, "node.exe");

  if (!fs.existsSync(cachedExe)) {
    if (!fs.existsSync(zipPath)) {
      console.log(`Downloading ${NODE_ZIP}...`);
      await download(NODE_URL, zipPath);
    }
    console.log("Extracting Node runtime...");
    rmrf(extractDir);
    execSync(`unzip -qo "${zipPath}" -d "${cacheDir}"`);
  }

  if (!fs.existsSync(cachedExe)) {
    throw new Error("node.exe missing after extract");
  }

  const runtimeDir = path.join(dist, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.copyFileSync(cachedExe, path.join(runtimeDir, "node.exe"));
}

async function main() {
  console.log("Building portable Windows dist...");
  rmrf(dist);
  fs.mkdirSync(dist, { recursive: true });

  fs.copyFileSync(path.join(root, "server.js"), path.join(dist, "server.js"));
  fs.copyFileSync(path.join(root, "package.json"), path.join(dist, "package.json"));
  copyDir(path.join(root, "public"), path.join(dist, "public"));
  copyDir(path.join(root, "sounds"), path.join(dist, "sounds"));

  const dataDir = path.join(dist, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const manifestSrc = path.join(root, "data", "sounds.json");
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(dataDir, "sounds.json"));
  } else {
    fs.writeFileSync(path.join(dataDir, "sounds.json"), "[]");
  }

  for (const name of [
    "Start-Soundboard.bat",
    "Start-Hidden.vbs",
    "Install-Startup.bat",
    "Uninstall-Startup.bat",
    "Allow-Firewall.bat",
    "README-WINDOWS.txt",
  ]) {
    fs.copyFileSync(path.join(win, name), path.join(dist, name));
  }

  console.log("Installing production dependencies...");
  execSync("npm install --omit=dev --no-fund --no-audit", {
    cwd: dist,
    stdio: "inherit",
  });

  // Drop packaging metadata from the shipped package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(dist, "package.json"), "utf8"));
  delete pkg.devDependencies;
  delete pkg.pkg;
  delete pkg.scripts.build;
  delete pkg.scripts["build:win"];
  delete pkg.scripts["pack:win"];
  fs.writeFileSync(path.join(dist, "package.json"), JSON.stringify(pkg, null, 2));

  await ensureNodeRuntime();

  console.log("\nWindows dist ready in ./dist");
  console.log("On PC: unzip and double-click Start-Soundboard.bat");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
