#!/usr/bin/env bash
#
# mc-smoke.sh — Fast health check for Mission Control (< 2 minutes)
# Validates: env vars, dependencies, workflows, schema structure
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

log_info() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)) || true; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARNINGS++)) || true; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; ((ERRORS++)) || true; }
log_section() { echo -e "\n${BLUE}$1${NC}"; }

echo "🩺 Mission Control Smoke Test"
echo "=============================="
echo "Started: $(date -Iseconds)"
echo "Workdir: $MC_DIR"
echo ""

# Check 1: Environment Variables
log_section "1. Environment Configuration"

if [[ -f "$MC_DIR/.env.local" ]]; then
    log_info ".env.local exists"
    
    REQUIRED_VARS=("CONVEX_URL" "VITE_CONVEX_URL" "API_SECRET")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$MC_DIR/.env.local" 2>/dev/null; then
            value=$(grep "^${var}=" "$MC_DIR/.env.local" | cut -d'=' -f2 | head -1)
            if [[ -n "$value" && "$value" != "your-$var" && "$value" != "https://your-deployment.convex.cloud" ]]; then
                log_info "$var is configured"
            else
                log_warn "$var has placeholder value"
            fi
        else
            log_error "$var is missing from .env.local"
        fi
    done
else
    log_warn ".env.local not found (copy from .env.example)"
fi

# Check 2: Dependencies
log_section "2. Dependencies"

if [[ -d "$MC_DIR/node_modules" ]]; then
    log_info "node_modules exists"
    
    PACKAGES=("convex" "typescript")
    for pkg in "${PACKAGES[@]}"; do
        if [[ -d "$MC_DIR/node_modules/$pkg" ]]; then
            log_info "$pkg installed"
        else
            log_error "$pkg not installed"
        fi
    done
    
    # React is in UI app in monorepo
    if [[ -d "$MC_DIR/apps/mission-control-ui/node_modules/react" || -d "$MC_DIR/node_modules/react" ]]; then
        log_info "react installed"
    else
        log_warn "react not found (may need to install UI deps)"
    fi
else
    log_warn "node_modules not found (run: pnpm install)"
fi

# Check 3: Workflow YAML Files
log_section "3. Workflow Definitions"

WORKFLOWS=("feature-dev" "bug-fix" "security-audit")
for workflow in "${WORKFLOWS[@]}"; do
    if [[ -f "$MC_DIR/workflows/${workflow}.yaml" ]]; then
        if python3 -c "import yaml; yaml.safe_load(open('$MC_DIR/workflows/${workflow}.yaml'))" 2>/dev/null; then
            log_info "${workflow}.yaml is valid"
        else
            log_error "${workflow}.yaml has invalid YAML"
        fi
    else
        log_error "${workflow}.yaml missing"
    fi
done

# Check for code-review (warn if missing)
if [[ -f "$MC_DIR/workflows/code-review.yaml" ]]; then
    log_info "code-review.yaml exists"
else
    log_warn "code-review.yaml missing (optional)"
fi

# Check 4: Convex Schema
log_section "4. Convex Schema"

if [[ -f "$MC_DIR/convex/schema.ts" ]]; then
    log_info "schema.ts exists"
    
    TABLES=("agents" "tasks" "workflows" "runs" "approvals")
    for table in "${TABLES[@]}"; do
        if grep -q "defineTable.*$table\|$table.*defineTable" "$MC_DIR/convex/schema.ts" 2>/dev/null; then
            log_info "Table '$table' defined"
        else
            log_warn "Table '$table' not found"
        fi
    done
else
    log_error "convex/schema.ts missing"
fi

# Check 5: Package Structure
log_section "5. Package Structure"

PACKAGES=("coordinator" "workflow-engine" "agent-runtime" "policy-engine" "state-machine")
for pkg in "${PACKAGES[@]}"; do
    if [[ -d "$MC_DIR/packages/$pkg" ]]; then
        log_info "packages/$pkg exists"
    else
        log_error "packages/$pkg missing"
    fi
done

# Check 6: Convex Functions
log_section "6. Convex Functions"

FUNCTIONS=("agents" "tasks" "workflows" "policy" "health")
for func in "${FUNCTIONS[@]}"; do
    if [[ -f "$MC_DIR/convex/${func}.ts" ]]; then
        log_info "convex/${func}.ts exists"
    else
        log_warn "convex/${func}.ts missing"
    fi
done

# Check 7: Scripts
log_section "7. Utility Scripts"

if [[ -f "$MC_DIR/scripts/mc-doctor.sh" ]]; then
    log_info "mc-doctor.sh exists"
else
    log_warn "mc-doctor.sh not found"
fi

# Check 8: Documentation
log_section "8. Documentation"

DOCS=("README.md" "docs/WORKFLOWS.md" "docs/BOOT_CONTRACT.md")
for doc in "${DOCS[@]}"; do
    if [[ -f "$MC_DIR/$doc" ]]; then
        log_info "$doc exists"
    else
        log_warn "$doc missing"
    fi
done

# Summary
echo ""
echo "=============================="
echo "Results:"
echo "  Passed:   $PASSED"
echo "  Warnings: $WARNINGS"
echo "  Failed:   $ERRORS"
echo ""

if [[ $ERRORS -eq 0 ]]; then
    echo -e "${GREEN}✅ Smoke test PASSED${NC}"
    echo "System appears healthy. Run mc-doctor.sh for deeper checks."
    exit 0
else
    echo -e "${RED}❌ Smoke test FAILED${NC}"
    echo "Fix errors above before proceeding."
    exit 1
fi
