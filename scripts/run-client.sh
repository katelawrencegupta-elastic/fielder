#!/bin/bash
# Run Vite client with cwd outside ~/Documents (launchd TCC cannot getcwd there).
set -euo pipefail
ROOT="__ROOT__"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export HOME="__HOME__"
cd "$HOME"
exec /opt/homebrew/bin/npm --prefix "$ROOT/client" run dev
