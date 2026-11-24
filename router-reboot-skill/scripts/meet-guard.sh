#!/usr/bin/env bash
# Thin wrapper so the guard can be wired in without knowing the node path.
# Exit 0 = safe to reboot, 1 = do not reboot.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/meet-guard.mjs" "$@"
