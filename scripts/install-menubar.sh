#!/bin/bash
# Install Fielder menu bar app + optional login LaunchAgent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MENUBAR="$ROOT/menubar"
APP_DIR="${HOME}/Applications/Fielder.app"
LAUNCH_AGENT="${HOME}/Library/LaunchAgents/com.fielder.menubar.plist"
LABEL="com.fielder.menubar"
STATE_DIR="${HOME}/Library/Application Support/Fielder"
ELECTRON_BIN=""

mode="${1:-}"

find_electron() {
  if [[ -x "$MENUBAR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]]; then
    ELECTRON_BIN="$MENUBAR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  elif [[ -x "$MENUBAR/node_modules/.bin/electron" ]]; then
    ELECTRON_BIN="$MENUBAR/node_modules/.bin/electron"
  else
    return 1
  fi
}

install_deps() {
  echo "Installing menu bar dependencies…"
  (cd "$MENUBAR" && npm install --no-fund --no-audit)
  chmod +x "$ROOT/scripts/fielder-ctl.sh"
}

write_app() {
  echo "Creating $APP_DIR …"
  find_electron || {
    echo "Electron binary not found after install" >&2
    exit 1
  }

  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

  # Prefer the template icon for the app bundle display if present
  if [[ -f "$MENUBAR/iconTemplate@2x.png" ]]; then
    cp "$MENUBAR/iconTemplate@2x.png" "$APP_DIR/Contents/Resources/AppIcon.png"
  fi

  cat >"$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Fielder</string>
  <key>CFBundleDisplayName</key>
  <string>Fielder</string>
  <key>CFBundleIdentifier</key>
  <string>com.fielder.menubar</string>
  <key>CFBundleExecutable</key>
  <string>Fielder</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

  cat >"$APP_DIR/Contents/MacOS/Fielder" <<EOF
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"
cd "$MENUBAR" || exit 1
exec "$ELECTRON_BIN" "$MENUBAR" "\$@"
EOF
  chmod +x "$APP_DIR/Contents/MacOS/Fielder"
  echo "App ready: $APP_DIR"
}

write_launchagent() {
  find_electron || {
    echo "Electron not installed; run without --launchagent-only first" >&2
    exit 1
  }
  mkdir -p "$(dirname "$LAUNCH_AGENT")" "$STATE_DIR/logs"
  touch "$STATE_DIR/autostart"

  cat >"$LAUNCH_AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${APP_DIR}/Contents/MacOS/Fielder</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${HOME}</string>
  <key>StandardOutPath</key>
  <string>${STATE_DIR}/logs/menubar.out.log</string>
  <key>StandardErrorPath</key>
  <string>${STATE_DIR}/logs/menubar.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENT"
  launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl load "$LAUNCH_AGENT" 2>/dev/null || true
  echo "LaunchAgent installed: $LAUNCH_AGENT"
}

uninstall_launchagent() {
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
  rm -f "$LAUNCH_AGENT"
  rm -f "$STATE_DIR/autostart"
  echo "LaunchAgent removed"
}

case "$mode" in
  --launchagent-only)
    write_app
    write_launchagent
    ;;
  --uninstall-launchagent)
    uninstall_launchagent
    ;;
  --uninstall)
    uninstall_launchagent
    rm -rf "$APP_DIR"
    echo "Removed $APP_DIR"
    ;;
  *)
    install_deps
    write_app
    write_launchagent
    # Open once now if not already running under launchd
    open "$APP_DIR" || true
    echo ""
    echo "Fielder menu bar is installed."
    echo "  • Icon appears in the menu bar (LSUIElement — no Dock icon)"
    echo "  • Starts at login via LaunchAgent"
    echo "  • Menu: Open / Start / Stop / Restart / Quit"
    echo "  • App path: $APP_DIR"
    ;;
esac
