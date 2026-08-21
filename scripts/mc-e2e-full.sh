#!/usr/bin/env bash
#
# mc-e2e-full.sh — Full E2E test suite for Mission Control
# Tests all major flows: agents, tasks, workflows, approvals, content drops
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
CLEANUP_REQUIRED=false

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)) || true; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAILED++)) || true; }
log_info() { echo -e "${BLUE}[TEST]${NC} $1"; }

cleanup_on_exit() {
    if [[ "$CLEANUP_REQUIRED" != "true" ]]; then
        return
    fi

    log_info "Emergency cleanup for interrupted run $RUN_ID..."
    if npx convex run e2e:cleanup "{\"runId\": \"$RUN_ID\"}" >/dev/null 2>&1; then
        log_pass "Interrupted E2E data cleaned up"
    else
        log_fail "Emergency E2E cleanup failed for $RUN_ID"
    fi
}

trap cleanup_on_exit EXIT

# Generate unique run ID
TIMESTAMP=$(date +%s)
SHORTID=$(openssl rand -hex 3 2>/dev/null || echo "$(date +%N | cut -c1-6)")
RUN_ID="E2E_FULL_${TIMESTAMP}_${SHORTID}"

echo "🧪 Mission Control Full E2E Test Suite"
echo "======================================"
echo "Run ID: $RUN_ID"
echo "Started: $(date -Iseconds)"
echo ""

# Source environment
cd "$MC_DIR"
if [[ -f ".env.local" ]]; then
    set -a
    source ".env.local" 2>/dev/null || true
    set +a
fi

# Check Convex URL
if [[ -z "${CONVEX_URL:-}" || "$CONVEX_URL" == *"your-deployment"* ]]; then
    echo "❌ CONVEX_URL not configured"
    exit 1
fi

log_info "Convex URL: ${CONVEX_URL:0:40}..."
echo ""

# ============================================================================
# TEST 1: Seed E2E Data
# ============================================================================
log_info "TEST 1: Seeding E2E data..."

SEED_RESULT=$(npx convex run e2e:seed "{\"runId\": \"$RUN_ID\"}") || {
    log_fail "E2E seed failed"
    exit 1
}

if jq -e '.success == true' >/dev/null <<<"$SEED_RESULT"; then
    CLEANUP_REQUIRED=true
    log_pass "E2E data seeded"
    AGENT_COUNT=$(jq '.agents | length' <<<"$SEED_RESULT")
    TASK_COUNT=$(jq '.tasks | length' <<<"$SEED_RESULT")
    log_info "  Created: $AGENT_COUNT agents, $TASK_COUNT tasks"
else
    log_fail "E2E seed returned error"
    exit 1
fi

# ============================================================================
# TEST 2: Validate Seed Data
# ============================================================================
echo ""
log_info "TEST 2: Validating seed data..."

VALIDATE_RESULT=$(npx convex run e2e:validate "{\"runId\": \"$RUN_ID\"}") || {
    log_fail "E2E validation failed"
    exit 1
}

if jq -e '.allValid == true' >/dev/null <<<"$VALIDATE_RESULT"; then
    log_pass "Seed data validation passed"
else
    log_fail "Seed data validation failed"
    jq '{agents, tasks, contentDrops, budget, workflowRuns}' <<<"$VALIDATE_RESULT"
fi

# ============================================================================
# TEST 3: Agent Lifecycle
# ============================================================================
echo ""
log_info "TEST 3: Testing agent lifecycle..."

# Get an agent
AGENT_ID=$(jq -r '.agents[0].id' <<<"$SEED_RESULT")
if [[ -n "$AGENT_ID" && "$AGENT_ID" != "null" ]]; then
    # Test heartbeat
    HEARTBEAT_RESULT=$(npx convex run api.agents.heartbeat "{\"agentId\": \"$AGENT_ID\"}") || true
    if [[ -n "$HEARTBEAT_RESULT" ]]; then
        log_pass "Seeded agent heartbeat works"
    else
        log_fail "Agent heartbeat failed"
    fi
else
    log_fail "Seed response did not include an agent"
fi

# ============================================================================
# TEST 4: Task Lifecycle
# ============================================================================
echo ""
log_info "TEST 4: Testing task lifecycle..."

# Get a task
TASK_ID=$(jq -r '.tasks[0].id' <<<"$SEED_RESULT")
if [[ -n "$TASK_ID" && "$TASK_ID" != "null" ]]; then
    # Test task get
    GET_RESULT=$(npx convex run api.tasks.get "{\"taskId\": \"$TASK_ID\"}") || true
    if [[ -n "$GET_RESULT" ]]; then
        log_pass "Seeded task get works"
    else
        log_fail "Task get failed"
    fi
else
    log_fail "Seed response did not include a task"
fi

# ============================================================================
# TEST 5: Workflow Operations
# ============================================================================
echo ""
log_info "TEST 5: Testing workflow operations..."

WORKFLOW_RESULT=$(npx convex run api.workflows.list '{}') || true
if [[ -n "$WORKFLOW_RESULT" ]]; then
    log_pass "Workflow list query works"
else
    log_fail "Workflow list query failed"
fi

# ============================================================================
# TEST 6: Approval Operations
# ============================================================================
echo ""
log_info "TEST 6: Testing approval operations..."

APPROVAL_RESULT=$(npx convex run api.approvals.list '{"limit": 5}') || true
if [[ -n "$APPROVAL_RESULT" ]]; then
    log_pass "Approval list query works"
else
    log_fail "Approval list query failed"
fi

# ============================================================================
# TEST 7: Content Drop Operations
# ============================================================================
echo ""
log_info "TEST 7: Testing content drop operations..."

DROP_RESULT=$(npx convex run api.contentDrops.list '{"limit": 5}') || true
if [[ -n "$DROP_RESULT" ]]; then
    log_pass "Content drop list query works"
else
    log_fail "Content drop list query failed"
fi

# ============================================================================
# TEST 8: Cleanup
# ============================================================================
echo ""
log_info "TEST 8: Cleaning up E2E data..."

CLEANUP_RESULT=$(npx convex run e2e:cleanup "{\"runId\": \"$RUN_ID\"}") || {
    log_fail "E2E cleanup failed"
}

if jq -e '.success == true' >/dev/null <<<"$CLEANUP_RESULT"; then
    CLEANUP_REQUIRED=false
    trap - EXIT
    log_pass "E2E data cleaned up"
else
    log_fail "E2E cleanup returned error"
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "======================================"
echo "📊 E2E Test Results"
echo "======================================"
echo "Run ID: $RUN_ID"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All E2E tests passed${NC}"
    exit 0
else
    echo -e "${RED}❌ Some E2E tests failed${NC}"
    exit 1
fi
