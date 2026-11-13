const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const multer = require("multer");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3847;
const IS_PKG = Boolean(process.pkg);
const BUNDLE_ROOT = __dirname;
const APP_ROOT = IS_PKG ? path.dirname(process.execPath) : __dirname;
const SOUNDS_DIR = path.join(APP_ROOT, "sounds");
const DATA_DIR = path.join(APP_ROOT, "data");
const MANIFEST_PATH = path.join(DATA_DIR, "sounds.json");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const PUBLIC_DIR = path.join(BUNDLE_ROOT, "public");

fs.mkdirSync(SOUNDS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(MANIFEST_PATH)) {
  fs.writeFileSync(MANIFEST_PATH, "[]");
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.85;
  return Math.min(1, Math.max(0, n));
}

let masterVolume = clampVolume(readSettings().volume ?? 0.85);

function setMasterVolume(value) {
  masterVolume = clampVolume(value);
  const settings = readSettings();
  settings.volume = masterVolume;
  writeSettings(settings);
  return masterVolume;
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeManifest(sounds) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(sounds, null, 2));
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function pickColor(seed) {
  const palette = [
    "#ff5a36",
    "#f4c430",
    "#2dd4a8",
    "#4cc9f0",
    "#ff4d6d",
    "#ffa94d",
    "#69db7c",
    "#748ffc",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function localAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === "IPv4" && !net.internal) results.push(net.address);
    }
  }
  return results;
}

function openBrowser(url) {
  if (process.env.NO_BROWSER === "1") return;
  const platform = process.platform;
  if (platform === "win32") {
    exec(`cmd /c start "" "${url}"`);
  } else if (platform === "darwin") {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SOUNDS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp3";
    const base = slugify(path.basename(file.originalname, path.extname(file.originalname))) || "sound";
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.originalname) ||
      (file.mimetype || "").startsWith("audio/");
    cb(ok ? null : new Error("Only audio files are allowed"), ok);
  },
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

app.use(express.json());
app.use("/sounds", express.static(SOUNDS_DIR, { maxAge: "1y", immutable: true }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/info", (_req, res) => {
  res.json({
    port: PORT,
    addresses: localAddresses(),
    soundCount: readManifest().length,
    volume: masterVolume,
  });
});

app.get("/api/settings", (_req, res) => {
  res.json({ volume: masterVolume });
});

app.put("/api/settings", (req, res) => {
  const volume = setMasterVolume(req.body?.volume);
  io.emit("volume", { volume });
  res.json({ volume });
});

app.get("/api/sounds", (_req, res) => {
  res.json(readManifest());
});

app.post("/api/sounds", (req, res) => {
  upload.single("audio")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Audio file required" });

    const name = (req.body.name || path.basename(req.file.originalname, path.extname(req.file.originalname))).trim();
    const id = `${slugify(name) || "sound"}-${Date.now()}`;
    const sound = {
      id,
      name: name || "Untitled",
      color: pickColor(id),
      file: req.file.filename,
      createdAt: new Date().toISOString(),
    };

    const sounds = readManifest();
    sounds.push(sound);
    writeManifest(sounds);
    io.emit("sounds:updated", sounds);
    res.status(201).json(sound);
  });
});

app.delete("/api/sounds/:id", (req, res) => {
  const sounds = readManifest();
  const index = sounds.findIndex((s) => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  const [removed] = sounds.splice(index, 1);
  writeManifest(sounds);

  const filePath = path.join(SOUNDS_DIR, removed.file);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  io.emit("sounds:updated", sounds);
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  socket.emit("sounds:updated", readManifest());
  socket.emit("volume", { volume: masterVolume });

  socket.on("role", (role) => {
    socket.data.role = role === "streamer" ? "streamer" : "board";
    socket.join(socket.data.role);
    io.emit("presence", presenceSnapshot());
  });

  socket.on("volume", (payload) => {
    const volume = setMasterVolume(payload && payload.volume);
    io.emit("volume", { volume });
  });

  socket.on("play", (payload) => {
    const soundId = payload && payload.id;
    if (!soundId) return;
    const sound = readManifest().find((s) => s.id === soundId);
    if (!sound) return;

    io.to("streamer").emit("play", {
      id: sound.id,
      name: sound.name,
      file: sound.file,
      url: `/sounds/${sound.file}`,
      at: Date.now(),
      from: socket.id,
      volume: masterVolume,
    });

    io.emit("play:echo", { id: sound.id, name: sound.name, at: Date.now() });
  });

  socket.on("stop-all", () => {
    io.to("streamer").emit("stop-all");
  });

  socket.on("disconnect", () => {
    io.emit("presence", presenceSnapshot());
  });
});

function presenceSnapshot() {
  const sockets = [...io.sockets.sockets.values()];
  return {
    streamers: sockets.filter((s) => s.data.role === "streamer").length,
    boards: sockets.filter((s) => s.data.role === "board").length,
  };
}

server.listen(PORT, "0.0.0.0", () => {
  const ips = localAddresses();
  const localUrl = `http://localhost:${PORT}`;
  console.log("\n  Local Soundboard is live\n");
  console.log(`  On this PC:     ${localUrl}`);
  for (const ip of ips) {
    console.log(`  On your phone:  http://${ip}:${PORT}`);
  }
  console.log("\n  Keep this window open. Open Streaming PC on the laptop, Soundboard on mobile.\n");
  openBrowser(localUrl);
});
