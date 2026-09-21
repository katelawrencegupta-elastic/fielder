#!/bin/bash
# Start / stop / status for Fielder server (3101) + Vite client (5173).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${HOME}/Library/Application Support/Fielder"
LOG_DIR="${STATE_DIR}/logs"
PID_SERVER="${STATE_DIR}/server.pid"
PID_CLIENT="${STATE_DIR}/client.pid"
LOCKDIR="${STATE_DIR}/ctl.lockdir"
PORT_SERVER=3101
PORT_CLIENT=5173
URL="http://127.0.0.1:${PORT_CLIENT}/"

mkdir -p "$STATE_DIR" "$LOG_DIR"

port_pids() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true
}

is_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' < "$file"
  fi
}

server_healthy() {
  curl -sf --max-time 1 "http://127.0.0.1:${PORT_SERVER}/api/health" >/dev/null 2>&1
}

wait_until_dead() {
  local pid="$1"
  local tries="${2:-16}"
  local i
  for i in $(seq 1 "$tries"); do
    is_alive "$pid" || return 0
    sleep 0.5
  done
  return 1
}

kill_port() {
  local port="$1"
  local pids
  pids="$(port_pids "$port")"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  local i
  for i in $(seq 1 8); do
    pids="$(port_pids "$port")"
    [[ -z "$pids" ]] && return 0
    sleep 0.5
  done
  pids="$(port_pids "$port")"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

acquire_lock() {
  if mkdir "$LOCKDIR" 2>/dev/null; then
    echo $$ >"$LOCKDIR/pid"
    return 0
  fi
  local other
  other="$(tr -d '[:space:]' <"$LOCKDIR/pid" 2>/dev/null || true)"
  if [[ -n "$other" ]] && is_alive "$other"; then
    return 1
  fi
  rm -rf "$LOCKDIR"
  mkdir "$LOCKDIR" 2>/dev/null || return 1
  echo $$ >"$LOCKDIR/pid"
}

release_lock() {
  rm -rf "$LOCKDIR"
}

status_json() {
  local server_up=false client_up=false server_ready=false
  [[ -n "$(port_pids "$PORT_SERVER")" ]] && server_up=true
  [[ -n "$(port_pids "$PORT_CLIENT")" ]] && client_up=true
  server_healthy && server_ready=true
  printf '{"server":%s,"client":%s,"url":"%s","ok":%s}\n' \
    "$server_up" "$client_up" "$URL" \
    "$([[ "$server_ready" == true && "$client_up" == true ]] && echo true || echo false)"
}

start() {
  if ! acquire_lock; then
    status_json
    return 0
  fi
  trap release_lock EXIT

  mkdir -p "$LOG_DIR"
  if [[ -z "$(port_pids "$PORT_SERVER")" ]]; then
    (
      cd "$ROOT/server"
      nohup node index.js >>"$LOG_DIR/server.log" 2>&1 &
      echo $! >"$PID_SERVER"
    )
  fi
  if [[ -z "$(port_pids "$PORT_CLIENT")" ]]; then
    (
      cd "$ROOT/client"
      nohup npm run dev >>"$LOG_DIR/client.log" 2>&1 &
      echo $! >"$PID_CLIENT"
    )
  fi

  local i
  for i in $(seq 1 50); do
    if server_healthy && [[ -n "$(port_pids "$PORT_CLIENT")" ]]; then
      status_json
      return 0
    fi
    sleep 0.25
  done
  status_json
  return 1
}

stop() {
  local pid
  pid="$(read_pid "$PID_CLIENT")"
  if is_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    wait_until_dead "$pid" 16 || kill -9 "$pid" 2>/dev/null || true
  fi
  pid="$(read_pid "$PID_SERVER")"
  if is_alive "$pid"; then
    kill -TERM "$pid" 2>/dev/null || true
    wait_until_dead "$pid" 16 || kill -9 "$pid" 2>/dev/null || true
  fi
  kill_port "$PORT_CLIENT"
  kill_port "$PORT_SERVER"
  rm -f "$PID_SERVER" "$PID_CLIENT"
  status_json
}

restart() {
  stop >/dev/null || true
  sleep 0.4
  start
}

open_app() {
  start >/dev/null || true
  open "$URL"
}

cmd="${1:-status}"
case "$cmd" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status_json ;;
  open) open_app ;;
  url) echo "$URL" ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|open|url}" >&2
    exit 2
    ;;
esac
