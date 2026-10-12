#!/usr/bin/env bash
# Point this clone at scripts/git-hooks (no husky).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$root/scripts/git-hooks/pre-commit"
git -C "$root" config core.hooksPath scripts/git-hooks
echo "Installed git hooks (core.hooksPath=scripts/git-hooks)"
