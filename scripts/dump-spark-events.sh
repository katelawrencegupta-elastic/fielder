#!/usr/bin/env bash
# Dump spark events output for Fielder parser debugging / refresh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/logs"
OUT="$ROOT/logs/spark-events-sample.txt"
ERR="$ROOT/logs/spark-events-sample.err"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
START="${1:-$(date +%F)}"
END="${2:-$(date -v+7d +%F 2>/dev/null || date -d '+7 days' +%F)}"
echo "Capturing: spark events --start $START --end $END"
/usr/local/bin/spark events --start "$START" --end "$END" >"$OUT" 2>"$ERR" || true
wc -c "$OUT" "$ERR"
echo "Wrote $OUT"
