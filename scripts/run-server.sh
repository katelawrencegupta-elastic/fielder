#!/bin/bash
# Run Fielder API with cwd outside ~/Documents (launchd TCC cannot getcwd there).
set -euo pipefail
ROOT="__ROOT__"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export HOME="__HOME__"
export SPARK_CLI_PATH="${SPARK_CLI_PATH:-/usr/local/bin/spark}"
export CALENDAR_SPARK="${CALENDAR_SPARK:-1}"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
cd "$HOME"
exec /opt/homebrew/bin/node "$ROOT/server/index.js"
