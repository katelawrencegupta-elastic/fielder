#!/usr/bin/env bash
# Force-push rewritten main after secret purge. Requires GitHub auth
# (`gh auth login` or an SSH key with push access).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

echo "Pushing rewritten main with --force-with-lease (rewrites origin/main history)…"
git push --force-with-lease origin main

echo "Verifying remote no longer has secrets…"
git fetch origin
if git ls-tree -r --name-only origin/main | grep -E '^\.env$|^calendar\.json$|(^|/)node_modules/|^logs/'; then
  echo "WARNING: origin/main still lists secret/junk paths" >&2
  exit 1
fi
echo "OK: origin/main is clean of .env / calendar.json / logs / node_modules"
