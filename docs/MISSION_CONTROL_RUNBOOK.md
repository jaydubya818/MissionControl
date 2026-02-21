# Mission Control Runbook — Operations Guide

**Version:** 1.0  
**Date:** 2026-02-21  
**Branch:** feat/mc-e2e-hardening

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Convex deployment

# 3. Run diagnostics
./scripts/mc-smoke.sh      # Fast health check
./scripts/mc-doctor.sh     # Deep diagnostics

# 4. Run E2E tests
./scripts/mc-seed-e2e.sh
# Copy RUN_ID from output
./scripts/mc-doctor.sh --e2e $RUN_ID
./scripts/mc-cleanup-e2e.sh $RUN_ID
```

---

## System Components

### UI (React + Vite)
- **Port:** 5173
- **Start:** `pnpm run dev:ui`
- **Health:** `curl http://localhost:5173`

### Convex Backend
- **Start:** `npx convex dev`
- **Health:** `curl $CONVEX_URL/health`
- **Dashboard:** `npx convex dashboard`

### Orchestration Server (Hono)
- **Port:** 3000
- **Start:** `pnpm run dev:orch`
- **Health:** `curl http://localhost:3000/health`

---

## Diagnostics

### Smoke Test (< 2 minutes)

```bash
./scripts/mc-smoke.sh
```

**Checks:**
- Environment variables
- Dependencies installed
- Workflow YAML validity
- Convex schema structure
- Package structure

**Exit codes:**
- 0 = All passed
- 1 = Failures found

### Doctor (Full Check)

```bash
./scripts/mc-doctor.sh
```

**Checks:**
- All smoke checks
- Convex connectivity
- Agent registry
- Task state machine
- Content drops
- Budget tracking
- Workflow engine
- Policy & governance

### E2E Validation

```bash
# Seed data
./scripts/mc-seed-e2e.sh

# Run validation
./scripts/mc-doctor.sh --e2e $RUN_ID

# Cleanup
./scripts/mc-cleanup-e2e.sh $RUN_ID
```

---

## Troubleshooting

### Issue: Dependencies Not Found

```bash
pnpm install
```

### Issue: Convex URL Not Configured

```bash
npx convex dev
# Copies deployment URL to .env.local
```

### Issue: TypeScript Errors

```bash
# Missing @types/node
pnpm add -D @types/node

# Or in specific package
cd packages/agent-runtime
pnpm add -D @types/node
```

### Issue: E2E Seed Fails

1. Check Convex URL: `echo $CONVEX_URL`
2. Verify deployment: `npx convex dashboard`
3. Check permissions

### Issue: Workflow YAML Invalid

```bash
# Validate single file
python3 -c "import yaml; yaml.safe_load(open('workflows/feature-dev.yaml'))"
```

---

## E2E Testing

### Full Cycle

```bash
# 1. Create seed
./scripts/mc-seed-e2e.sh
# RUN_ID=E2E_1708544400_a1b2c3d4

# 2. Validate
./scripts/mc-doctor.sh --e2e E2E_1708544400_a1b2c3d4

# 3. Cleanup
./scripts/mc-cleanup-e2e.sh E2E_1708544400_a1b2c3d4
```

### What Gets Created

| Object | Count | Prefix |
|--------|-------|--------|
| Agents | 2 | e2e_scout_, e2e_executor_ |
| Tasks | 3 | E2E inbox, content, budget |
| Content Drops | 2 | e2e-drop: |
| Budget Entries | 2 | +1.00, -0.25 |
| Workflow Run | 1 | feature-dev toy |

### Validation Checks

- ✅ Both agents retrievable
- ✅ Inbox task completes lifecycle (INBOX → DONE)
- ✅ Content drops retrievable with metadata
- ✅ Budget total = +0.75
- ✅ Workflow run exists

---

## CI/CD

### GitHub Actions

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install
      - run: ./scripts/mc-smoke.sh
      - run: pnpm run typecheck
      - run: pnpm run lint
```

### Local CI Simulation

```bash
pnpm install
pnpm run ci:prepare
pnpm run ci:typecheck
pnpm run ci:test
```

---

## Workflow Reference

### Built-in Workflows

| Workflow | Agents | Purpose |
|----------|--------|---------|
| feature-dev | 7 | Plan → Setup → Implement → Verify → Test → PR → Review |
| bug-fix | 6 | Triage → Investigate → Setup → Fix → Verify → PR |
| security-audit | 7 | Scan → Prioritize → Setup → Fix → Verify → Test → PR |
| code-review | 4 | Intake → Review → Verify → Approve |

### Running Workflows

```bash
# Via Convex CLI
npx convex run api.workflows.run --arg '{
  "workflowId": "feature-dev",
  "input": "Add user authentication",
  "projectId": "my-project"
}'
```

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| CONVEX_URL | ✅ | — | Convex backend URL |
| VITE_CONVEX_URL | ✅ | — | Convex URL for UI |
| API_SECRET | ✅ | — | API authentication |
| API_PORT | ❌ | 3000 | Orchestration port |
| HEARTBEAT_INTERVAL_MS | ❌ | 30000 | Tick interval |
| LOG_LEVEL | ❌ | info | Logging verbosity |

---

## Files Reference

| File | Purpose |
|------|---------|
| `docs/BOOT_CONTRACT.md` | System startup guide |
| `docs/E2E_TEST_PLAN.md` | E2E testing specification |
| `docs/INTEGRATION_REPORT.md` | Audit results |
| `scripts/mc-smoke.sh` | Fast health check |
| `scripts/mc-doctor.sh` | Deep diagnostics |
| `scripts/mc-seed-e2e.sh` | E2E seed creation |
| `scripts/mc-cleanup-e2e.sh` | E2E cleanup |
| `convex/e2e.ts` | E2E Convex mutations |

---

## Support

- **Docs:** `docs/`
- **Tests:** `convex/__tests__/`
- **Scripts:** `scripts/`
- **Repo:** https://github.com/jaydubya818/MissionControl
