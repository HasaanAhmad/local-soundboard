const { app, BrowserWindow, Tray, Menu, nativeImage, shell, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");

process.env.NO_BROWSER = "1";

const isPackaged = app.isPackaged;
const projectRoot = path.join(__dirname, "..");
const bundleRoot = isPackaged ? app.getAppPath() : projectRoot;
const appRoot = isPackaged
  ? path.join(app.getPath("userData"), "soundboard")
  : projectRoot;

process.env.SOUNDBOARD_BUNDLE = bundleRoot;
process.env.SOUNDBOARD_APP_ROOT = appRoot;

const { startServer, PORT, localAddresses } = require("../server.js");

let mainWindow = null;
let tray = null;
let serverInfo = null;

function iconPath() {
  const candidates = [
    path.join(bundleRoot, "public", "icons", "icon-512.png"),
    path.join(projectRoot, "public", "icons", "icon-512.png"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function phoneUrl() {
  const ip = localAddresses()[0];
  return ip ? `http://${ip}:${PORT}` : `http://127.0.0.1:${PORT}`;
}

function createWindow() {
  const icon = iconPath();
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 640,
    title: "Local Soundboard",
    backgroundColor: "#12100e",
    autoHideMenuBar: true,
    show: false,
    icon: icon || undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/?role=streamer`);

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTray() {
  const iconFile = iconPath();
  const image = iconFile
    ? nativeImage.createFromPath(iconFile).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip("Local Soundboard");

  const refreshMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "Show Soundboard",
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          },
        },
        {
          label: `Phone: ${phoneUrl()}`,
          enabled: false,
        },
        {
          label: "Copy phone link",
          click: () => clipboard.writeText(phoneUrl()),
        },
        {
          label: "Open phone link",
          click: () => shell.openExternal(phoneUrl()),
        },
        { type: "separator" },
        {
          label: "Quit",
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ])
    );
  };

  refreshMenu();
  setInterval(refreshMenu, 15000);

  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  try {
    serverInfo = await startServer({ openBrowser: false });
  } catch (err) {
    console.error("Failed to start soundboard server:", err);
    app.quit();
    return;
  }

  createWindow();
  buildTray();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", async () => {
  app.isQuitting = true;
  if (serverInfo?.close) {
    try {
      await serverInfo.close();
    } catch {
      /* ignore */
    }
  }
});
