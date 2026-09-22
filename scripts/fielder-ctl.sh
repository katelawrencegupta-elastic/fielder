#!/bin/bash
# Start / stop / status for Fielder server (3101) + Vite client (5173).
#
# Starts via double-fork daemonize so:
# 1) processes survive Cursor/agent shell cleanup
# 2) children inherit this shell's Documents TCC (launchd cannot read ~/Documents)
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

write_listener_pid() {
  local port="$1"
  local file="$2"
  local pid
  pid="$(port_pids "$port" | head -n 1 || true)"
  if [[ -n "$pid" ]]; then
    echo "$pid" >"$file"
  fi
}

# Double-fork so the grandchild is reparented to launchd and not killed with this shell.
daemonize() {
  local cwd="$1"
  local pidfile="$2"
  local logfile="$3"
  shift 3
  local -a cmd=("$@")
  python3 - "$cwd" "$pidfile" "$logfile" "${cmd[@]}" <<'PY'
import os, sys, time

cwd, pidfile, logfile = sys.argv[1], sys.argv[2], sys.argv[3]
cmd = sys.argv[4:]

if os.fork() > 0:
    # Parent returns immediately to the shell / Cursor session.
    sys.exit(0)

os.setsid()
if os.fork() > 0:
    os._exit(0)

os.chdir(cwd)
os.umask(0)
# Redirect stdio to the log file.
fd = os.open(logfile, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
os.close(fd)
try:
    devnull = os.open(os.devnull, os.O_RDONLY)
    os.dup2(devnull, 0)
    os.close(devnull)
except OSError:
    pass

# Write pid after the second fork so stop() targets the real daemon.
try:
    with open(pidfile, "w", encoding="utf-8") as f:
        f.write(str(os.getpid()))
except OSError:
    pass

os.environ.setdefault("PATH", "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin")
os.execvp(cmd[0], cmd)
PY
}

load_env() {
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
  export PATH="/usr/local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"
  export SPARK_CLI_PATH="${SPARK_CLI_PATH:-/usr/local/bin/spark}"
  export CALENDAR_SPARK="${CALENDAR_SPARK:-1}"
}

bootout_stale_launchagents() {
  # Older ctl versions installed LaunchAgents that hang under Documents TCC.
  local uid domain
  uid="$(id -u)"
  domain="gui/${uid}"
  for label in com.fielder.server com.fielder.client; do
    launchctl bootout "${domain}/${label}" 2>/dev/null || true
  done
}

start() {
  if ! acquire_lock; then
    status_json
    return 0
  fi
  trap release_lock EXIT

  mkdir -p "$LOG_DIR"
  bootout_stale_launchagents
  load_env

  if [[ -z "$(port_pids "$PORT_SERVER")" ]]; then
    daemonize "$ROOT/server" "$PID_SERVER" "$LOG_DIR/server.log" node index.js
  fi
  if [[ -z "$(port_pids "$PORT_CLIENT")" ]]; then
    daemonize "$ROOT/client" "$PID_CLIENT" "$LOG_DIR/client.log" npm run dev
  fi

  local i
  for i in $(seq 1 60); do
    if server_healthy && [[ -n "$(port_pids "$PORT_CLIENT")" ]]; then
      write_listener_pid "$PORT_SERVER" "$PID_SERVER"
      write_listener_pid "$PORT_CLIENT" "$PID_CLIENT"
      status_json
      return 0
    fi
    sleep 0.25
  done
  write_listener_pid "$PORT_SERVER" "$PID_SERVER"
  write_listener_pid "$PORT_CLIENT" "$PID_CLIENT"
  status_json
  return 1
}

stop() {
  bootout_stale_launchagents
  local pid
  pid="$(read_pid "$PID_CLIENT")"
  if is_alive "$pid"; then
    # Kill process group when possible (npm + vite).
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
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
