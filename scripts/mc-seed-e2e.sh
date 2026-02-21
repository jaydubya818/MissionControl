#!/usr/bin/env bash
#
# mc-seed-e2e.sh — Create deterministic E2E test data
# Generates unique run_id, creates seed data, prints IDs for validation
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

# Generate unique run ID
TIMESTAMP=$(date +%s)
SHORTID=$(openssl rand -hex 4 2>/dev/null || echo "$(date +%N | cut -c1-8)")
RUN_ID="E2E_${TIMESTAMP}_${SHORTID}"

echo "🔬 Mission Control E2E Seed"
echo "============================"
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
    echo "Run: npx convex dev"
    exit 1
fi

echo "📡 Convex URL: ${CONVEX_URL:0:40}..."
echo ""

# Create seed data via Convex mutation
echo "🌱 Seeding E2E data..."

SEED_OUTPUT=$(cd "$MC_DIR" && npx convex run api.e2e.seed --arg "{\"runId\": \"$RUN_ID\"}" 2>&1)

if [[ $? -ne 0 ]]; then
    echo "❌ Seed failed:"
    echo "$SEED_OUTPUT"
    exit 1
fi

echo "✅ Seed completed successfully"
echo ""
echo "📋 Created Objects:"
echo "$SEED_OUTPUT" | jq -r '
  "Agents: \(.agents | length)",
  (.agents[] | "  - \(.name) (ID: \(.id))"),
  "",
  "Tasks: \(.tasks | length)",
  (.tasks[] | "  - \(.title) (ID: \(.id), Status: \(.status))"),
  "",
  "Content Drops: \(.contentDrops | length)",
  (.contentDrops[] | "  - \(.title) (ID: \(.id))"),
  "",
  "Budget Entries: \(.budgetEntries | length)",
  "  Total: +\(.budgetTotal) units"
'

echo ""
echo "🔑 Key Variables:"
echo "  RUN_ID=$RUN_ID"
echo "  SCOUT_AGENT_ID=$(echo "$SEED_OUTPUT" | jq -r '.agents[] | select(.name | contains("scout")) | .id')"
echo "  EXECUTOR_AGENT_ID=$(echo "$SEED_OUTPUT" | jq -r '.agents[] | select(.name | contains("executor")) | .id')"
echo "  INBOX_TASK_ID=$(echo "$SEED_OUTPUT" | jq -r '.tasks[] | select(.type == "e2e_inbox_roundtrip") | .id')"
echo ""

# Save to file for later cleanup
echo "$SEED_OUTPUT" > "/tmp/mc-e2e-seed-${RUN_ID}.json"
echo "💾 Seed data saved to: /tmp/mc-e2e-seed-${RUN_ID}.json"
echo ""

echo "✅ Seed complete. Use RUN_ID=$RUN_ID for validation."
echo "   To cleanup: ./scripts/mc-cleanup-e2e.sh $RUN_ID"
