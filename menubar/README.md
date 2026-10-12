# Fielder menu bar

Tray controller so Fielder runs in the background without Cursor.

## Install

```bash
cd /path/to/fielder
npm run menubar:install
```

This:
- installs Electron for the tray app
- creates `~/Applications/Fielder.app` (menu-bar only, no Dock icon)
- registers a LaunchAgent so it starts at login
- starts Fielder (API `:3101` + UI `:5173`)

## Menu

- **Open Fielder** — ensure services are up and open the browser
- **Start / Stop / Restart**
- **Show Logs** — `~/Library/Application Support/Fielder/logs`
- **Start Fielder at Login** — toggle LaunchAgent
- **Quit Fielder Menu** — leave services running
- **Quit & Stop Fielder** — stop API/UI and quit tray

## Manual controls

```bash
npm run fielder -- start
npm run fielder -- stop
npm run fielder -- status
npm run fielder -- open
```

## Uninstall

```bash
bash scripts/install-menubar.sh --uninstall
```
