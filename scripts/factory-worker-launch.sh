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
# The adapter admits only the evaluated Codex build (version and native digest), and falls back to `codex` on PATH,
# which under a service manager resolves to an unqualified install. Default to the pinned build when it is present;
# an explicit CODEX_EXECUTABLE (for example from the env file) always wins, and the adapter still verifies it.
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ] && [ -z "${CODEX_EXECUTABLE:-}" ]; then
  pinned="$HOME/.mission-control/codex-0.146.0/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex"
  if [ -x "$pinned" ]; then CODEX_EXECUTABLE="$pinned"; export CODEX_EXECUTABLE; fi
fi
[ "$#" -gt 0 ] || set -- pnpm run worker:implementation
exec "$@"
