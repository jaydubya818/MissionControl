#!/usr/bin/env bash

set -euo pipefail

echo "scripts/autonomous-agent.sh is retired for V1: direct Agent Task writes are not an authenticated service boundary." >&2
echo "Use mission-control-orchestration and its signed, leased service commands." >&2
exit 1
