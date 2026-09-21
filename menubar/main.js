const { app, Tray, Menu, nativeImage, shell, Notification } = require("electron");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const fs = require("fs");

const execFileAsync = promisify(execFile);

// Hide Dock icon — tray-only agent
app.dock?.hide();

const ROOT = path.resolve(__dirname, "..");
const CTL = path.join(ROOT, "scripts", "fielder-ctl.sh");
const STATE_DIR = path.join(app.getPath("home"), "Library", "Application Support", "Fielder");
const AUTO_START = path.join(STATE_DIR, "autostart");
const DEFAULT_STATUS = { server: false, client: false, ok: false, url: "http://127.0.0.1:5173/" };

let tray = null;
let status = { ...DEFAULT_STATUS };
let pollTimer = null;
let pollBusy = false;

function ensureCtlExecutable() {
  try {
    fs.chmodSync(CTL, 0o755);
  } catch {
    /* ignore */
  }
}

async function runCtl(args, timeout = 30000) {
  const { stdout } = await execFileAsync(CTL, args, {
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  return stdout.trim();
}

async function refreshStatus() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    status = JSON.parse(await runCtl(["status"], 8000));
  } catch {
    status = { ...DEFAULT_STATUS };
  } finally {
    pollBusy = false;
  }
  updateMenu();
  updateTitle();
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  const ms = status.ok ? 15000 : 4000;
  pollTimer = setTimeout(async () => {
    await refreshStatus();
    schedulePoll();
  }, ms);
}

function updateTitle() {
  if (!tray) return;
  // Template image stays monochrome; title shows a compact status mark.
  tray.setTitle(status.ok ? "" : " ·");
  tray.setToolTip(status.ok ? "Fielder — running" : "Fielder — stopped");
}

function notify(body) {
  if (!Notification.isSupported()) return;
  new Notification({ title: "Fielder", body }).show();
}

function buildIcon() {
  // 16x16 template PNG (black glyph on transparent) — Electron treats *Template* as menu-bar tintable.
  const iconPath = path.join(__dirname, "iconTemplate.png");
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    img.setTemplateImage(true);
    return img;
  }
  // Fallback: tiny blank template
  const empty = nativeImage.createEmpty();
  empty.setTemplateImage(true);
  return empty;
}

function updateMenu() {
  if (!tray) return;
  const auto = fs.existsSync(AUTO_START);
  const label = status.ok
    ? "Status: Running"
    : status.server || status.client
      ? "Status: Partial"
      : "Status: Stopped";

  const menu = Menu.buildFromTemplate([
    { label: "Fielder", enabled: false },
    { label, enabled: false },
    { type: "separator" },
    {
      label: "Open Fielder",
      accelerator: "Command+O",
      click: async () => {
        try {
          await runCtl(["open"]);
          await refreshStatus();
        } catch (err) {
          notify(`Could not open: ${err.message}`);
        }
      },
    },
    {
      label: "Start",
      enabled: !status.ok,
      click: async () => {
        try {
          await runCtl(["start"]);
          await refreshStatus();
          notify(status.ok ? "Fielder is running" : "Start may still be warming up");
        } catch (err) {
          notify(`Start failed: ${err.message}`);
          await refreshStatus();
        }
      },
    },
    {
      label: "Stop",
      enabled: status.server || status.client,
      click: async () => {
        try {
          await runCtl(["stop"]);
          await refreshStatus();
          notify("Fielder stopped");
        } catch (err) {
          notify(`Stop failed: ${err.message}`);
          await refreshStatus();
        }
      },
    },
    {
      label: "Restart",
      click: async () => {
        try {
          await runCtl(["restart"]);
          await refreshStatus();
          notify(status.ok ? "Fielder restarted" : "Restart finished — check status");
        } catch (err) {
          notify(`Restart failed: ${err.message}`);
          await refreshStatus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Open in Browser",
      click: () => shell.openExternal(status.url || DEFAULT_STATUS.url),
    },
    {
      label: "Show Logs",
      click: () => shell.openPath(path.join(STATE_DIR, "logs")),
    },
    { type: "separator" },
    {
      label: "Start Fielder at Login",
      type: "checkbox",
      checked: auto,
      click: (item) => {
        try {
          if (item.checked) {
            fs.mkdirSync(STATE_DIR, { recursive: true });
            fs.writeFileSync(AUTO_START, "1\n");
            spawn("bash", [path.join(ROOT, "scripts", "install-menubar.sh"), "--launchagent-only"], {
              detached: true,
              stdio: "ignore",
            }).unref();
          } else {
            if (fs.existsSync(AUTO_START)) fs.unlinkSync(AUTO_START);
            spawn("bash", [path.join(ROOT, "scripts", "install-menubar.sh"), "--uninstall-launchagent"], {
              detached: true,
              stdio: "ignore",
            }).unref();
          }
        } catch (err) {
          notify(err.message);
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Fielder Menu",
      accelerator: "Command+Q",
      click: () => {
        // Leave services running; only quit the tray.
        app.quit();
      },
    },
    {
      label: "Quit & Stop Fielder",
      click: async () => {
        try {
          await runCtl(["stop"]);
        } catch {
          /* ignore */
        }
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(async () => {
  ensureCtlExecutable();
  fs.mkdirSync(STATE_DIR, { recursive: true });

  tray = new Tray(buildIcon());
  tray.setToolTip("Fielder");
  await refreshStatus();

  // Auto-start services when tray launches (unless already up)
  if (!status.ok) {
    try {
      await runCtl(["start"]);
      await refreshStatus();
    } catch {
      await refreshStatus();
    }
  }

  schedulePoll();
});

app.on("before-quit", () => {
  if (pollTimer) clearTimeout(pollTimer);
});

// Single instance
const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
}
