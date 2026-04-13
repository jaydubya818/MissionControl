# Mission Control

**Agent orchestration platform for AI squads.**

Mission Control manages autonomous agents: task lifecycle, workflows, approvals, and team coordination.

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/jaydubya818/MissionControl.git
cd MissionControl
pnpm install

# 2. Configure environment (required for the UI to load data)
cp .env.example .env.local
# Edit .env.local: set CONVEX_URL and VITE_CONVEX_URL.
# Run `npx convex dev` once and paste the deployment URL into both variables.

# 3. Start development (from repo root)
pnpm run dev                    # Starts Convex + UI together → http://localhost:5173
# If port 5173 is in use, Vite will print the actual URL (e.g. http://localhost:5174).
pnpm run dev:ui                 # UI only (needs VITE_CONVEX_URL in .env.local)
pnpm run dev:orchestration      # Orchestration server (http://localhost:4100), optional
```

If **http://localhost:5173** doesn’t load: (1) Run `pnpm run dev` from the repo root so both Convex and the UI start. (2) If you see “Convex is not configured”, add `VITE_CONVEX_URL` to `.env.local` (same value as `CONVEX_URL`) and restart the dev server.

## Architecture

- **UI:** React 18 + Vite → http://localhost:5173
- **Backend:** Convex (serverless functions + database; no Express)
- **Orchestration:** Hono server (coordinator loop + agent runtime) → http://localhost:4100
- **CLI:** `mc` command (see `scripts/mc`). Diagnostics: `./scripts/mc-doctor.sh`

## CLI Usage

```bash
mc doctor              # Health check
mc status              # System status
mc run feature-dev     # Start workflow
mc tasks INBOX         # List tasks
mc claim               # Claim next task
```

## Workflows

- **feature-dev:** Plan → Implement → Test → PR
- **bug-fix:** Triage → Fix → Verify → PR
- **security-audit:** Scan → Prioritize → Fix → Verify
- **code-review:** Analyze → Security → Style → Approve

## Key Features

- ✅ Multi-agent workflows (YAML-defined)
- ✅ Task state machine (INBOX → ASSIGNED → IN_PROGRESS → REVIEW → DONE)
- ✅ Auto-approval for LOW risk tasks
- ✅ Structured logging with JSON output
- ✅ Exponential backoff + jitter for retries
- ✅ Idempotency keys for all creates

## Documentation

- [Runbook](docs/MISSION_CONTROL_RUNBOOK.md) — Operations, E2E, CI
- [Troubleshooting](docs/guides/TROUBLESHOOTING.md) — Diagnostics and common fixes
- [Setup Guide](docs/BOOT_CONTRACT.md)
- [shadcn Workflow](docs/SHADCN_UI_WORKFLOW.md) — Intentional UI component workflow for Mission Control
- [Enhancement Plan](docs/MISSION_CONTROL_ENHANCEMENT_PLAN.md) — What to adopt next and what to ignore
- [Workflows](docs/WORKFLOWS.md)

## License

MIT
