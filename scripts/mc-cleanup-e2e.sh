#!/usr/bin/env bash
#
# mc-cleanup-e2e.sh — Cleanup E2E test data
# Usage: ./scripts/mc-cleanup-e2e.sh <RUN_ID>
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <RUN_ID>"
    echo "Example: $0 E2E_1708544400_a1b2c3d4"
    exit 1
fi

RUN_ID="$1"

echo "🧹 Mission Control E2E Cleanup"
echo "=============================="
echo "Run ID: $RUN_ID"
echo "Started: $(date -Iseconds)"
echo ""

# Source env if exists
if [[ -f "$MC_DIR/.env.local" ]]; then
    set -a
    source "$MC_DIR/.env.local" 2>/dev/null || true
    set +a
fi

# Check Convex URL
if [[ -z "${CONVEX_URL:-}" || "$CONVEX_URL" == *"your-deployment"* ]]; then
    echo "❌ CONVEX_URL not configured"
    exit 1
fi

# Run cleanup
echo "🗑️  Cleaning up E2E data..."

CLEANUP_OUTPUT=$(cd "$MC_DIR" && npx convex run api.e2e.cleanup --arg "{\"runId\": \"$RUN_ID\"}" 2>&1)

if [[ $? -ne 0 ]]; then
    echo "❌ Cleanup failed:"
    echo "$CLEANUP_OUTPUT"
    exit 1
fi

echo "✅ Cleanup completed successfully"
echo ""
echo "📊 Cleanup Results:"
echo "$CLEANUP_OUTPUT" | jq -r '
  "  Agents deleted: \(.agentsDeleted)",
  "  Tasks deleted: \(.tasksDeleted)",
  "  Content drops deleted: \(.dropsDeleted)",
  "  Activities deleted: \(.activitiesDeleted)",
  "  Workflow runs deleted: \(.workflowRunsDeleted)"
'

echo ""
echo "✅ E2E data for $RUN_ID has been cleaned up."

# Remove seed file if exists
if [[ -f "/tmp/mc-e2e-seed-${RUN_ID}.json" ]]; then
    rm "/tmp/mc-e2e-seed-${RUN_ID}.json"
    echo "🗑️  Removed seed file: /tmp/mc-e2e-seed-${RUN_ID}.json"
fi
