# Mission Control

**Agent orchestration platform for AI squads.**

Mission Control manages autonomous agents: task lifecycle, workflows, approvals, and team coordination.

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/jaydubya818/MissionControl.git
cd MissionControl
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Convex URL

# 3. Start development
pnpm run dev          # UI + Convex
pnpm run dev:orchestration  # Orchestration server
```

## Architecture

- **UI:** React 18 + Vite → http://localhost:5173
- **Backend:** Convex (serverless functions + database)
- **Orchestration:** Hono server for agent lifecycle
- **CLI:** `mc` command for agents (see `scripts/mc`)

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

- [Setup Guide](docs/BOOT_CONTRACT.md)
- [Workflows](docs/WORKFLOWS.md)
- [Runbook](docs/MISSION_CONTROL_RUNBOOK.md)

## License

MIT
