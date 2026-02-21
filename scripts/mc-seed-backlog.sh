#!/usr/bin/env bash
#
# mc-seed-backlog.sh — Create Mission Control improvement tasks in INBOX
# Seeds a backlog of actionable tasks for agents to implement simplifications
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

# Generate unique run ID
TIMESTAMP=$(date +%s)
SHORTID=$(openssl rand -hex 3 2>/dev/null || echo "$(date +%N | cut -c1-6)")
RUN_ID="MC_BACKLOG_${TIMESTAMP}_${SHORTID}"

echo "📋 Mission Control Backlog Seeder"
echo "=================================="
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

# Project ID for Mission Control project
PROJECT_ID="ks7998y3ve5g4hqh7g1pd5d78h80c07z"

# Function to create a task
create_task() {
    local title="$1"
    local description="$2"
    local acceptance="$3"
    local complexity="$4"
    local tags="$5"
    
    npx convex run api.tasks.create "{
        \"projectId\": \"$PROJECT_ID\",
        \"title\": \"$title\",
        \"description\": \"$description\",
        \"type\": \"ENGINEERING\",
        \"priority\": 2,
        \"metadata\": {
            \"e2eRunId\": \"$RUN_ID\",
            \"backlogItem\": true,
            \"acceptanceCriteria\": \"$acceptance\",
            \"complexity\": \"$complexity\",
            \"tags\": $tags
        },
        \"source\": \"AGENT\",
        \"createdBy\": \"AGENT\"
    }" 2>/dev/null | jq -r '._id'
}

echo "🌱 Seeding backlog tasks..."
echo ""

# Array to store created task IDs
declare -a TASK_IDS=()

# ============================================
# A) Simplification / Deletion Tasks
# ============================================

echo "🗑️  Creating Simplification/Deletion tasks..."

TASK_IDS+=($(create_task \
    "A1: Remove packages/voice (unused)" \
    "The voice package is unused and adds unnecessary complexity. Remove the entire package directory and all references." \
    "packages/voice/ directory deleted; no build errors; all tests pass" \
    "S" \
    '["cleanup", "simplification"]'))

TASK_IDS+=($(create_task \
    "A2: Remove packages/agent-runner (legacy)" \
    "The agent-runner package is legacy and superseded by orchestration-server. Remove it." \
    "packages/agent-runner/ directory deleted; no references remain; CI passes" \
    "S" \
    '["cleanup", "simplification"]'))

TASK_IDS+=($(create_task \
    "A3: Consolidate coordinator + orchestration-server" \
    "Merge packages/coordinator into apps/orchestration-server to reduce package count." \
    "Single orchestration package; no @mission-control/coordinator imports; all tests pass" \
    "M" \
    '["simplification", "refactoring"]'))

TASK_IDS+=($(create_task \
    "A4: Merge context-router into memory" \
    "The context-router and memory packages overlap in functionality. Merge them." \
    "Single memory package; context-router functions available; no breaking changes" \
    "M" \
    '["simplification", "refactoring"]'))

TASK_IDS+=($(create_task \
    "A5: Simplify task states (9 → 5)" \
    "Reduce task states: INBOX→TODO, remove ASSIGNED/NEEDS_APPROVAL, keep IN_PROGRESS/REVIEW/DONE/BLOCKED." \
    "Only 5 task states exist; migrations handled; UI updated; tests pass" \
    "L" \
    '["simplification", "ux", "breaking"]'))

# ============================================
# B) Reliability Hardening Tasks
# ============================================

echo "🔒 Creating Reliability Hardening tasks..."

TASK_IDS+=($(create_task \
    "B1: Add exponential backoff for heartbeats" \
    "Implement exponential backoff with jitter for heartbeat failures: 1s, 2s, 4s, 8s, max 30s." \
    "Heartbeat failures retry with backoff; logs show retry attempts; no infinite loops" \
    "M" \
    '["reliability", "resilience"]'))

TASK_IDS+=($(create_task \
    "B2: Add idempotency keys to all creates" \
    "Ensure all task/workflow/content create operations require and validate idempotencyKey." \
    "All create ops have idempotencyKey; duplicates rejected; tests verify" \
    "M" \
    '["reliability", "data-integrity"]'))

TASK_IDS+=($(create_task \
    "B3: Add structured logging" \
    "Implement JSON logging with fields: timestamp, run_id, task_id, agent_id, step_id, status, error_code." \
    "All logs are JSON; required fields present; logs parseable; no PII in logs" \
    "M" \
    '["reliability", "observability"]'))

TASK_IDS+=($(create_task \
    "B4: Add jitter to Convex writes" \
    "Add random jitter (0-100ms) to Convex write operations to prevent thundering herd." \
    "Convex writes have jitter; no performance regression; tests pass" \
    "S" \
    '["reliability", "performance"]'))

TASK_IDS+=($(create_task \
    "B5: Auto-approve LOW risk tasks" \
    "Skip approval workflow for LOW risk tasks; only require approval for HIGH risk." \
    "LOW risk tasks auto-complete; HIGH risk still require approval; tests verify" \
    "M" \
    '["reliability", "ux"]'))

# ============================================
# C) Agent UX / Workflow Ergonomics
# ============================================

echo "👤 Creating Agent UX tasks..."

TASK_IDS+=($(create_task \
    "C1: Create 'mc' CLI command" \
    "Create unified CLI: mc doctor, mc run <workflow>, mc status, mc logs." \
    "mc command available globally; all subcommands work; --help shows usage" \
    "L" \
    '["ux", "cli", "agent-ergonomics"]'))

TASK_IDS+=($(create_task \
    "C2: Standardize package naming" \
    "Rename: orch → orchestration, ensure consistent naming across codebase." \
    "No 'orch' references; all packages have clear names; imports updated" \
    "M" \
    '["ux", "code-quality"]'))

TASK_IDS+=($(create_task \
    "C3: Simplify workflow YAML format" \
    "Reduce workflow YAML complexity; make steps more readable for agents." \
    "Workflows are agent-readable; 20% less YAML lines; examples documented" \
    "M" \
    '["ux", "workflows", "agent-ergonomics"]'))

TASK_IDS+=($(create_task \
    "C4: Add agent-friendly step contracts" \
    "Document expected inputs/outputs/next_action for each workflow step." \
    "All workflow steps have contracts; agents can follow without guessing" \
    "S" \
    '["ux", "workflows", "documentation"]'))

TASK_IDS+=($(create_task \
    "C5: Create single-page agent guide" \
    "Write 'How to build an agent for Mission Control' — one page, step-by-step." \
    "Guide exists in docs/; covers setup, run, submit, status; examples work" \
    "S" \
    '["ux", "documentation", "onboarding"]'))

# ============================================
# D) Tests / CI
# ============================================

echo "🧪 Creating Tests/CI tasks..."

TASK_IDS+=($(create_task \
    "D1: Ensure mc-smoke.sh passes" \
    "Verify mc-smoke.sh runs in <2 min and returns PASS for simplified system." \
    "mc-smoke.sh passes (exit 0) in <2 min; all checks green" \
    "M" \
    '["ci", "testing", "verification"]'))

TASK_IDS+=($(create_task \
    "D2: Ensure mc-doctor.sh passes" \
    "Verify mc-doctor.sh runs full diagnostics and returns PASS." \
    "mc-doctor.sh passes (>90% checks); E2E validation works; cleanup works" \
    "M" \
    '["ci", "testing", "verification"]'))

TASK_IDS+=($(create_task \
    "D3: Add GitHub Actions CI" \
    "Create .github/workflows/ci.yml that runs lint, typecheck, smoke, unit tests." \
    "CI runs on PR; all checks pass; blocks merge on failure" \
    "S" \
    '["ci", "automation"]'))

TASK_IDS+=($(create_task \
    "D4: Add E2E test coverage" \
    "Ensure E2E tests cover: seed, validation, cleanup for all object types." \
    "E2E tests exist for agents, tasks, drops, budget, workflows; all pass" \
    "M" \
    '["testing", "e2e", "coverage"]'))

# ============================================
# E) Docs / Onboarding
# ============================================

echo "📚 Creating Docs/Onboarding tasks..."

TASK_IDS+=($(create_task \
    "E1: Update MISSION_CONTROL_RUNBOOK.md" \
    "Update runbook with simplified operations, new CLI commands, troubleshooting." \
    "Runbook current; covers mc CLI; troubleshooting section complete" \
    "S" \
    '["docs", "operations"]'))

TASK_IDS+=($(create_task \
    "E2: Update README with simplified setup" \
    "Reduce README to essential: install, config, run, verify. Remove noise." \
    "README <100 lines; clear setup steps; quickstart works" \
    "S" \
    '["docs", "onboarding"]'))

TASK_IDS+=($(create_task \
    "E3: Document breaking changes" \
    "List all breaking changes in docs/BREAKING_CHANGES.md for migration." \
    "Breaking changes documented; migration guide exists; examples provided" \
    "S" \
    '["docs", "migration"]'))

TASK_IDS+=($(create_task \
    "E4: Create architecture diagram" \
    "Simple diagram showing: UI → Convex → Orchestration → Agents." \
    "Diagram exists in docs/; shows data flow; updated for simplified system" \
    "S" \
    '["docs", "architecture"]'))

echo ""
echo "✅ Backlog seeding complete!"
echo ""
echo "📊 Summary:"
echo "  Run ID: $RUN_ID"
echo "  Tasks created: ${#TASK_IDS[@]}"
echo ""
echo "📝 Created Task IDs:"
for id in "${TASK_IDS[@]}"; do
    echo "  - $id"
done
echo ""
echo "🔗 View in Mission Control UI:"
echo "   http://localhost:5173 (INBOX column)"
echo ""
echo "🏷️  Tags breakdown:"
echo "   Simplification: 5 tasks"
echo "   Reliability: 5 tasks"
echo "   Agent UX: 5 tasks"
echo "   Tests/CI: 4 tasks"
echo "   Docs: 4 tasks"
echo ""
echo "💾 Run ID saved for reference: $RUN_ID"
