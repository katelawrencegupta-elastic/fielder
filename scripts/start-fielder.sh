#!/usr/bin/env bash
# Start Fielder API outside Cursor so Spark CLI can reach Spark Desktop.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"
mkdir -p "$ROOT/logs"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
export SPARK_CLI_PATH="${SPARK_CLI_PATH:-/usr/local/bin/spark}"
export CALENDAR_SPARK="${CALENDAR_SPARK:-1}"

if lsof -tiTCP:3101 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Stopping existing listener on :3101…"
  lsof -tiTCP:3101 -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 1
fi

echo "Starting Fielder on :3101"
echo "  spark=$(command -v "${SPARK_CLI_PATH}" || echo missing)"
echo "  CALENDAR_SPARK=${CALENDAR_SPARK}"
# Quick Spark sanity check (non-fatal)
if command -v "${SPARK_CLI_PATH}" >/dev/null 2>&1; then
  if ! "${SPARK_CLI_PATH}" events --today >/dev/null 2>&1; then
    echo "  warning: spark CLI could not read events (is Spark Desktop running with Read access?)"
  else
    echo "  spark events: ok"
  fi
fi

exec node index.js
