#!/bin/sh
# Launch the factory worker (or any command) with a host environment that passes the Codex containment probe.
# Works the same from Terminal, launchd, or an IDE/tool shell that strips the environment.
#   MC_WORKER_ENV_FILE  mode-600 env file with the worker settings (default below)
#   usage: scripts/factory-worker-launch.sh [command ...]   (default: pnpm run worker:implementation)
set -eu
ENV_FILE="${MC_WORKER_ENV_FILE:-$HOME/.mission-control/qualification-20261128/worker.env}"
[ -f "$ENV_FILE" ] || { echo "worker env file not found: $ENV_FILE" >&2; exit 2; }
perm=$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE")
case "$perm" in 600|400) ;; *) echo "refusing $ENV_FILE: mode $perm (must be 600 or 400)" >&2; exit 2;; esac
set -a; . "$ENV_FILE"; set +a
if [ "$(uname -s)" = "Darwin" ]; then
  case "${TMPDIR:-}" in ""|/tmp|/tmp/*|/private/tmp|/private/tmp/*) TMPDIR="$(getconf DARWIN_USER_TEMP_DIR)"; export TMPDIR;; esac
fi
[ "$#" -gt 0 ] || set -- pnpm run worker:implementation
exec "$@"
