# Mission Control — Boot Contract

**Version:** 0.9.0  
**Date:** 2026-02-21  
**Branch:** feat/mc-e2e-hardening

---

## System Components

### 1. UI App (React + Vite)

**Location:** `apps/mission-control-ui/`  
**Entry:** `vite dev` (port 5173)  
**Build:** `pnpm run build`  
**Required Env:**
- `VITE_CONVEX_URL` — Convex deployment URL

**Boot Command:**
```bash
pnpm run dev:ui
# or
pnpm --filter mission-control-ui dev
```

---

### 2. Convex Backend

**Location:** `convex/`  
**Entry:** `npx convex dev`  
**Required Env:**
- `CONVEX_DEPLOYMENT` — e.g., `dev:fancy-fox-123`
- `CONVEX_DEPLOY_KEY` — Deployment key
- `CONVEX_URL` — Full URL

**Boot Command:**
```bash
npx convex dev
# Generates .env.local with deployment details
```

**Key Functions:**
- `agents.ts` — Registration, heartbeat
- `tasks.ts` — CRUD, state transitions
- `workflows.ts` — Workflow definitions
- `workflowRuns.ts` — Workflow execution
- `policy.ts` — Governance/approvals
- `health.ts` — Health checks

---

### 3. Orchestration Server (Hono)

**Location:** `apps/orchestration-server/`  
**Entry:** `src/index.ts`  
**Port:** 3000 (configurable via `API_PORT`)  
**Required Env:**
- `CONVEX_URL` — To connect to backend
- `API_SECRET` — For authentication
- `API_PORT` — Server port (default: 3000)
- `HEARTBEAT_INTERVAL_MS` — Worker tick rate (default: 30000)

**Boot Command:**
```bash
pnpm run dev:orch
# or
pnpm --filter @mission-control/orchestration-server dev
```

**Responsibilities:**
- Heartbeat loop for agent liveness
- Task polling and assignment
- Workflow execution coordination

---

### 4. Workflow Engine

**Location:** `packages/workflow-engine/`  
**Entry:** Loaded by orchestration server  
**Components:**
- `loader.ts` — YAML workflow loading
- `executor.ts` — Step execution
- `renderer.ts` — Template rendering
- `parser.ts` — Output parsing

**Workflow Files:**
- `workflows/feature-dev.yaml`
- `workflows/bug-fix.yaml`
- `workflows/security-audit.yaml`
- `workflows/code-review.yaml` (if present)

---

## Complete Boot Sequence

### Development Mode

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local (see Required Env above)

# 3. Start Convex (generates deployment URL)
npx convex dev &

# 4. Start orchestration server
pnpm run dev:orch &

# 5. Start UI (optional)
pnpm run dev:ui &
```

### One-Command Dev Mode

```bash
pnpm run dev
# Runs: convex dev + ui dev (concurrently)
```

---

## Health Check Endpoints

### Convex Health
```bash
curl $CONVEX_URL/health
# Expected: 200 OK
```

### Orchestration Server Health
```bash
curl http://localhost:3000/health
# Expected: {"status": "healthy", "timestamp": "..."}
```

### UI Health
```bash
curl http://localhost:5173
# Expected: 200 OK (serves React app)
```

---

## Files to Touch for E2E Hardening

### Phase 1 — Test Plan & Scripts
- `docs/E2E_TEST_PLAN.md` — NEW
- `scripts/mc-smoke.sh` — NEW/ENHANCE
- `scripts/mc-doctor.sh` — NEW/ENHANCE
- `workflows/code-review.yaml` — NEW (if missing)

### Phase 2 — Fixes
- `convex/*.ts` — Fix any validation failures
- `packages/*/src/*.ts` — Fix integration issues

### Phase 3 — Reliability
- `packages/coordinator/src/tick.ts` — Add backoff
- `convex/lib/logging.ts` — Structured logging
- `convex/lib/idempotency.ts` — Idempotency keys

### Phase 4 — CI
- `.github/workflows/ci.yml` — NEW

---

## Environment Variable Contract

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `CONVEX_URL` | ✅ | — | Convex backend URL |
| `VITE_CONVEX_URL` | ✅ | — | Convex URL for UI |
| `API_SECRET` | ✅ | — | API authentication |
| `API_PORT` | ❌ | 3000 | Orchestration server port |
| `HEARTBEAT_INTERVAL_MS` | ❌ | 30000 | Worker tick interval |
| `LOG_LEVEL` | ❌ | info | Logging verbosity |
| `TELEGRAM_BOT_TOKEN` | ❌ | — | Telegram integration |
| `SENTRY_DSN` | ❌ | — | Error tracking |

---

## Validation Checklist

- [ ] `pnpm install` completes without errors
- [ ] `npx convex dev` starts and generates deployment URL
- [ ] Orchestration server starts on port 3000
- [ ] UI loads at localhost:5173
- [ ] Health endpoints return 200
- [ ] Agent registration succeeds
- [ ] Task creation → claim → complete works
- [ ] Workflow execution succeeds
