#!/usr/bin/env bash
#
# mc-doctor.sh — Deep diagnostics for Mission Control
# Tests: env, convex connectivity, data layer, workflows, round trips
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."
ERRORS=0
WARNINGS=0
PASSED=0
DRY_RUN=${DRY_RUN:-false}

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)) || true; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARNINGS++)) || true; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((ERRORS++)) || true; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_section() { 
    echo ""
    echo "========================================"
    echo -e "${BLUE}$1${NC}"
    echo "========================================"
}

echo "🏥 Mission Control Deep Diagnostics"
echo "===================================="
echo "Started: $(date -Iseconds)"
echo "Workdir: $MC_DIR"
echo "Dry Run: $DRY_RUN"
echo ""

# Source env if exists
if [[ -f "$MC_DIR/.env.local" ]]; then
    set -a
    source "$MC_DIR/.env.local" 2>/dev/null || true
    set +a
fi

# ============================================
# A) BOOT VALIDATION
# ============================================
log_section "A) Boot Validation"

# A1: Environment
if [[ -n "${CONVEX_URL:-}" && "$CONVEX_URL" != *"your-deployment"* ]]; then
    log_pass "CONVEX_URL configured"
else
    log_fail "CONVEX_URL not configured or has placeholder"
    log_info "Run: npx convex dev (to generate deployment URL)"
fi

if [[ -n "${API_SECRET:-}" && "${#API_SECRET}" -gt 10 ]]; then
    log_pass "API_SECRET configured"
else
    log_warn "API_SECRET not set or too short"
fi

# A2: Dependencies
if [[ -d "$MC_DIR/node_modules/convex" ]]; then
    log_pass "convex package installed"
else
    log_fail "convex not installed (run: pnpm install)"
fi

if [[ -d "$MC_DIR/apps/mission-control-ui/node_modules/react" || -d "$MC_DIR/node_modules/react" ]]; then
    log_pass "react installed"
else
    log_warn "react not in root (check UI app)"
fi

# A3: TypeScript compilation
if $DRY_RUN; then
    log_info "[DRY RUN] Would run: pnpm run typecheck"
else
    if pnpm run typecheck > /tmp/typecheck.log 2>&1; then
        log_pass "TypeScript typecheck passed"
    else
        log_fail "TypeScript typecheck failed"
        tail -20 /tmp/typecheck.log
    fi
fi

# ============================================
# B) CONVEX + DATA LAYER
# ============================================
log_section "B) Convex + Data Layer"

# B1: Convex Ping (if URL configured)
if [[ -n "${CONVEX_URL:-}" && "$CONVEX_URL" != *"your-deployment"* ]]; then
    if command -v curl &> /dev/null; then
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONVEX_URL" || echo "000")
        if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "404" ]]; then
            log_pass "Convex endpoint reachable (HTTP $HTTP_STATUS)"
        else
            log_warn "Convex endpoint returned HTTP $HTTP_STATUS"
        fi
    else
        log_warn "curl not available, skipping connectivity check"
    fi
else
    log_warn "Skipping Convex ping (URL not configured)"
fi

# B2: Schema Sanity
if [[ -f "$MC_DIR/convex/schema.ts" ]]; then
    SCHEMA_TABLES=("agents" "tasks" "workflows" "workflowRuns" "runs" "approvals" "activities" "projects")
    for table in "${SCHEMA_TABLES[@]}"; do
        if grep -q "defineTable.*$table\|$table.*defineTable" "$MC_DIR/convex/schema.ts" 2>/dev/null; then
            log_pass "Schema table '$table' defined"
        else
            log_warn "Schema table '$table' not found"
        fi
    done
else
    log_fail "convex/schema.ts missing"
fi

# B3: Required Functions
CONVEX_FUNCTIONS=("agents" "tasks" "workflows" "policy" "health" "workflowRuns")
for func in "${CONVEX_FUNCTIONS[@]}"; do
    if [[ -f "$MC_DIR/convex/${func}.ts" ]]; then
        log_pass "Function 'convex/${func}.ts' exists"
    else
        log_warn "Function 'convex/${func}.ts' missing"
    fi
done

# B4: Agent Registry Fields
if [[ -f "$MC_DIR/convex/agents.ts" ]]; then
    REQUIRED_FIELDS=("agentId" "name" "emoji" "role" "status" "lastHeartbeatAt")
    for field in "${REQUIRED_FIELDS[@]}"; do
        if grep -q "$field" "$MC_DIR/convex/agents.ts"; then
            log_pass "Agent field '$field' found"
        else
            log_warn "Agent field '$field' not found"
        fi
    done
else
    log_fail "convex/agents.ts missing"
fi

# ============================================
# C) INBOX LIFECYCLE
# ============================================
log_section "C) Inbox Lifecycle (Task States)"

# Check task state machine definition
if [[ -f "$MC_DIR/convex/tasks.ts" ]]; then
    TASK_STATES=("INBOX" "ASSIGNED" "IN_PROGRESS" "REVIEW" "DONE" "BLOCKED" "FAILED")
    for state in "${TASK_STATES[@]}"; do
        if grep -q "$state" "$MC_DIR/convex/tasks.ts"; then
            log_pass "Task state '$state' defined"
        else
            log_warn "Task state '$state' not found"
        fi
    done
else
    log_fail "convex/tasks.ts missing"
fi

# Check transitions
if [[ -f "$MC_DIR/convex/transitions.ts" ]]; then
    log_pass "Task transitions defined"
else
    log_warn "convex/transitions.ts not found (may be in tasks.ts)"
fi

# ============================================
# D) CONTENT DROPS
# ============================================
log_section "D) Content Drops"

# Check for content drop functionality
CONTENT_DROP_FILES=("convex/runs.ts" "convex/activities.ts")
FOUND=false
for file in "${CONTENT_DROP_FILES[@]}"; do
    if [[ -f "$MC_DIR/$file" ]] && grep -q "content\|drop\|artifact" "$MC_DIR/$file" 2>/dev/null; then
        log_pass "Content drops referenced in $file"
        FOUND=true
    fi
done

if ! $FOUND; then
    log_warn "Content drop functionality not clearly found"
fi

# ============================================
# E) BUDGET LEDGER
# ============================================
log_section "E) Budget Ledger"

# Check budget tracking
if [[ -f "$MC_DIR/convex/agents.ts" ]]; then
    if grep -q "budget\|spend\|cost" "$MC_DIR/convex/agents.ts"; then
        log_pass "Budget tracking found in agents.ts"
    else
        log_warn "Budget tracking not found"
    fi
fi

# Check budget defaults in schema
if [[ -f "$MC_DIR/convex/schema.ts" ]] && grep -q "budget\|dailyBudget" "$MC_DIR/convex/schema.ts"; then
    log_pass "Budget fields in schema"
fi

# ============================================
# F) WORKFLOW ENGINE
# ============================================
log_section "F) Workflow Engine"

# F1: Workflow Engine Package
if [[ -d "$MC_DIR/packages/workflow-engine" ]]; then
    log_pass "workflow-engine package exists"
    
    ENGINE_COMPONENTS=("loader.ts" "executor.ts" "renderer.ts" "parser.ts")
    for comp in "${ENGINE_COMPONENTS[@]}"; do
        if [[ -f "$MC_DIR/packages/workflow-engine/src/${comp}" ]]; then
            log_pass "Workflow engine component: $comp"
        else
            log_warn "Missing: $comp"
        fi
    done
else
    log_fail "packages/workflow-engine missing"
fi

# F2: Workflow Definitions
WORKFLOWS=("feature-dev" "bug-fix" "security-audit")
for workflow in "${WORKFLOWS[@]}"; do
    if [[ -f "$MC_DIR/workflows/${workflow}.yaml" ]]; then
        if python3 -c "import yaml; yaml.safe_load(open('$MC_DIR/workflows/${workflow}.yaml'))" 2>/dev/null; then
            # Count steps
            STEP_COUNT=$(grep -c "^  - id:" "$MC_DIR/workflows/${workflow}.yaml" || echo "0")
            log_pass "${workflow}.yaml valid ($STEP_COUNT steps)"
        else
            log_fail "${workflow}.yaml has YAML errors"
        fi
    else
        log_fail "${workflow}.yaml missing"
    fi
done

# F3: Code Review Workflow (optional but recommended)
if [[ -f "$MC_DIR/workflows/code-review.yaml" ]]; then
    log_pass "code-review.yaml exists"
else
    log_warn "code-review.yaml missing (recommended)"
fi

# ============================================
# G) POLICY & GOVERNANCE
# ============================================
log_section "G) Policy & Governance"

# Check policy engine
if [[ -f "$MC_DIR/packages/policy-engine/src/index.ts" ]]; then
    if grep -q "GREEN\|YELLOW\|RED" "$MC_DIR/packages/policy-engine/src/index.ts"; then
        log_pass "Risk levels (GREEN/YELLOW/RED) defined"
    fi
    
    if grep -q "approval\|approve" "$MC_DIR/packages/policy-engine/src/index.ts"; then
        log_pass "Approval workflow detected"
    fi
else
    log_warn "Policy engine not found"
fi

# Check policy in convex
if [[ -f "$MC_DIR/convex/policy.ts" ]]; then
    log_pass "convex/policy.ts exists"
fi

# ============================================
# H) ORCHESTRATION
# ============================================
log_section "H) Orchestration Server"

if [[ -d "$MC_DIR/apps/orchestration-server" ]]; then
    log_pass "orchestration-server app exists"
    
    if [[ -f "$MC_DIR/apps/orchestration-server/src/index.ts" ]]; then
        log_pass "Orchestration server entry point exists"
    fi
else
    log_warn "apps/orchestration-server missing"
fi

# Check heartbeat/tick
if [[ -f "$MC_DIR/packages/coordinator/src/tick.ts" ]]; then
    log_pass "Coordinator tick/heartbeat exists"
else
    log_warn "coordinator/src/tick.ts not found"
fi

# ============================================
# I) UI
# ============================================
log_section "I) UI Application"

if [[ -d "$MC_DIR/apps/mission-control-ui" ]]; then
    log_pass "mission-control-ui app exists"
    
    if [[ -f "$MC_DIR/apps/mission-control-ui/package.json" ]]; then
        log_pass "UI package.json exists"
    fi
else
    log_warn "apps/mission-control-ui missing"
fi

# ============================================
# J) TESTS
# ============================================
log_section "J) Test Suite"

# Check for tests
TEST_FILES=("convex/__tests__/tasks.test.ts" "convex/__tests__/integration.test.ts")
for test in "${TEST_FILES[@]}"; do
    if [[ -f "$MC_DIR/$test" ]]; then
        log_pass "Test file: $test"
    else
        log_warn "Missing test: $test"
    fi
done

# ============================================
# K) E2E VALIDATION (if --e2e flag provided)
# ============================================

E2E_RUN_ID="${1:-}"
if [[ "$E2E_RUN_ID" == --e2e* ]]; then
    E2E_RUN_ID="${E2E_RUN_ID#--e2e}"
    E2E_RUN_ID="${E2E_RUN_ID#=}"
    E2E_RUN_ID="${E2E_RUN_ID# }"
fi

if [[ -n "$E2E_RUN_ID" ]]; then
    log_section "K) E2E Validation (RUN_ID: $E2E_RUN_ID)"
    
    # Check if seed data exists
    log_info "Checking E2E seed data..."
    
    VALIDATION_OUTPUT=$(cd "$MC_DIR" && npx convex run api.e2e.validate --arg "{\"runId\": \"$E2E_RUN_ID\"}" 2>&1)
    
    if [[ $? -ne 0 ]]; then
        log_fail "E2E validation query failed"
        log_info "Attempting to seed data..."
        
        # Try to seed
        SEED_OUTPUT=$(cd "$MC_DIR" && npx convex run api.e2e.seed --arg "{\"runId\": \"$E2E_RUN_ID\"}" 2>&1)
        if [[ $? -ne 0 ]]; then
            log_fail "E2E seed failed: $SEED_OUTPUT"
        else
            log_pass "E2E seed completed"
            # Re-run validation
            VALIDATION_OUTPUT=$(cd "$MC_DIR" && npx convex run api.e2e.validate --arg "{\"runId\": \"$E2E_RUN_ID\"}" 2>&1)
        fi
    fi
    
    # Parse validation results
    if echo "$VALIDATION_OUTPUT" | jq -e '.allValid' > /dev/null 2>&1; then
        log_pass "E2E validation query succeeded"
        
        # Check agents
        AGENTS_FOUND=$(echo "$VALIDATION_OUTPUT" | jq -r '.agents.found')
        AGENTS_EXPECTED=$(echo "$VALIDATION_OUTPUT" | jq -r '.agents.expected')
        if [[ "$AGENTS_FOUND" -ge "$AGENTS_EXPECTED" ]]; then
            log_pass "E2E agents: $AGENTS_FOUND/$AGENTS_EXPECTED"
        else
            log_fail "E2E agents: $AGENTS_FOUND/$AGENTS_EXPECTED"
        fi
        
        # Check tasks
        TASKS_FOUND=$(echo "$VALIDATION_OUTPUT" | jq -r '.tasks.found')
        TASKS_EXPECTED=$(echo "$VALIDATION_OUTPUT" | jq -r '.tasks.expected')
        if [[ "$TASKS_FOUND" -ge "$TASKS_EXPECTED" ]]; then
            log_pass "E2E tasks: $TASKS_FOUND/$TASKS_EXPECTED"
        else
            log_fail "E2E tasks: $TASKS_FOUND/$TASKS_EXPECTED"
        fi
        
        # Check content drops
        DROPS_FOUND=$(echo "$VALIDATION_OUTPUT" | jq -r '.contentDrops.found')
        DROPS_EXPECTED=$(echo "$VALIDATION_OUTPUT" | jq -r '.contentDrops.expected')
        if [[ "$DROPS_FOUND" -ge "$DROPS_EXPECTED" ]]; then
            log_pass "E2E content drops: $DROPS_FOUND/$DROPS_EXPECTED"
        else
            log_fail "E2E content drops: $DROPS_FOUND/$DROPS_EXPECTED"
        fi
        
        # Check budget
        BUDGET_TOTAL=$(echo "$VALIDATION_OUTPUT" | jq -r '.budget.total')
        BUDGET_EXPECTED=$(echo "$VALIDATION_OUTPUT" | jq -r '.budget.expected')
        if echo "$VALIDATION_OUTPUT" | jq -e '.budget.valid' > /dev/null 2>&1; then
            log_pass "E2E budget: $BUDGET_TOTAL/$BUDGET_EXPECTED"
        else
            log_fail "E2E budget: $BUDGET_TOTAL (expected $BUDGET_EXPECTED)"
        fi
        
        # Check workflow runs
        WORKFLOWS_FOUND=$(echo "$VALIDATION_OUTPUT" | jq -r '.workflowRuns.found')
        WORKFLOWS_EXPECTED=$(echo "$VALIDATION_OUTPUT" | jq -r '.workflowRuns.expected')
        if [[ "$WORKFLOWS_FOUND" -ge "$WORKFLOWS_EXPECTED" ]]; then
            log_pass "E2E workflow runs: $WORKFLOWS_FOUND/$WORKFLOWS_EXPECTED"
        else
            log_fail "E2E workflow runs: $WORKFLOWS_FOUND/$WORKFLOWS_EXPECTED"
        fi
        
        # Overall
        if echo "$VALIDATION_OUTPUT" | jq -e '.allValid' > /dev/null 2>&1; then
            log_pass "E2E validation PASSED"
        else
            log_fail "E2E validation FAILED"
        fi
    else
        log_fail "E2E validation failed or returned invalid data"
        log_info "Output: $VALIDATION_OUTPUT"
    fi
fi

# ============================================
# SUMMARY
# ============================================
log_section "SUMMARY"

echo "Completed: $(date -Iseconds)"
echo ""
echo "Results:"
echo "  ✅ Passed:   $PASSED"
echo "  ⚠️  Warnings: $WARNINGS"
echo "  ❌ Failed:   $ERRORS"
echo ""

if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo "Mission Control is fully operational."
    exit 0
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  CHECKS PASSED WITH WARNINGS${NC}"
    echo "System operational but review warnings above."
    exit 0
else
    echo -e "${RED}❌ CHECKS FAILED${NC}"
    echo "Fix errors before deploying to production."
    exit 1
fi
