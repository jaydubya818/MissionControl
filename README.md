# Mission Control

**Agent orchestration platform for AI squads.**

Mission Control manages autonomous agents: task lifecycle, workflows, approvals, team coordination, and the Software Factory operator shell.

---

## Quick Start (normal development)

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
pnpm run dev:ui                 # UI only (needs VITE_CONVEX_URL in .env.local)
pnpm run dev:orchestration      # Orchestration server (http://localhost:4100), optional
```

If **http://localhost:5173** doesn't load: (1) Run `pnpm run dev` from the repo root so both Convex and the UI start. (2) If you see "Convex is not configured", add `VITE_CONVEX_URL` to `.env.local` (same value as `CONVEX_URL`) and restart the dev server.

For detailed run commands, see [docs/guides/RUN.md](docs/guides/RUN.md).

---

## Software Factory Demo (local, end-to-end)

The full v2 operator experience — EOS Command Center, context registry, knowledge graph, kanban, QC, approvals — runs from **this repo** with feature flags.

**Canonical URL:** [http://localhost:5199/v2/command-center](http://localhost:5199/v2/command-center)

### Quick start (main repo — recommended)

**Terminal 1 — backend + UI (one command)**

```bash
pnpm run dev:demo
```

Or split across two terminals:

```bash
# Terminal 1
npx convex dev

# Terminal 2 (after Convex is ready)
pnpm run dev:demo:ui
```

**Seed demo data** (from repo root, with Convex running):

```bash
pnpm run convex:seed:demo          # ~380 Atlas Checkout rows (sf-demo)
pnpm run import:knowledge-graph:demo   # optional: Memory → Graph tab
```

Open [http://localhost:5199/v2/command-center](http://localhost:5199/v2/command-center). Select workspace **Software Factory Demo**.

Required env: `.env.local` with `CONVEX_URL` / `VITE_CONVEX_URL` (created by `npx convex dev` on first run).

### Legacy: git worktree demo

Older setups used separate worktrees (`sf-19-ui-migration` + `sf-90-demo`). Main repo now includes EOS + registry; worktrees are optional for branch isolation only.

```
┌─────────────────────────────────────┐     ┌──────────────────────────────────┐
│  UI  (port 5199)                    │     │  Backend  (port 3210)            │
│  ~/worktrees/sf-19-ui-migration     │────▶│  ~/worktrees/sf-90-demo          │
│  Vite + v2 feature flags            │     │  npx convex dev                  │
└─────────────────────────────────────┘     │  seedFactoryDemo (~380 rows)     │
                                            └──────────────────────────────────┘
```

Both worktrees share the same local Convex deployment (`http://127.0.0.1:3210`). The demo narrative is **Atlas Checkout** under project **Software Factory Demo** (slug `sf-demo`).

### Prerequisites: git worktrees

The demo requires two worktrees checked out alongside your main clone:

| Worktree | Branch | Purpose |
|----------|--------|---------|
| `~/worktrees/sf-19-ui-migration` | `sf/19-ui-v2-migration` | v2 shell + registry UI |
| `~/worktrees/sf-90-demo` | `sf/90-demo-seed` | Demo Convex functions + seed |

Create them once (adjust paths as needed):

```bash
git worktree add ~/worktrees/sf-19-ui-migration sf/19-ui-v2-migration
git worktree add ~/worktrees/sf-90-demo sf/90-demo-seed
cd ~/worktrees/sf-19-ui-migration && pnpm install
cd ~/worktrees/sf-90-demo && pnpm install
```

Each worktree needs its own `.env.local` with `CONVEX_URL` and `VITE_CONVEX_URL` pointing at `http://127.0.0.1:3210` (created automatically by `npx convex dev` on first run).

### Run the demo (two terminals)

**Terminal 1 — backend (keep running)**

```bash
cd ~/worktrees/sf-90-demo && npx convex dev
```

Wait for `Convex functions ready!` before opening the UI.

**Terminal 2 — UI with v2 flags**

```bash
cd ~/worktrees/sf-19-ui-migration
set -a; source .env.local; set +a
VITE_FLAG_UI_SHELL_V2=true VITE_FLAG_CONTEXT_REGISTRY=true VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW=true \
  pnpm --filter mission-control-ui exec vite --port 5199 --strictPort
```

Open [http://localhost:5199/v2/command-center](http://localhost:5199/v2/command-center) (EOS nav) or [http://localhost:5199/v2/home](http://localhost:5199/v2/home) (classic Overview). The workspace selector should show **Software Factory Demo**.

### Seed and reset demo data

Run these from the **`sf-90-demo` worktree** (or use `pnpm run convex:seed:demo` from main):

```bash
cd ~/worktrees/sf-90-demo

./scripts/mc demo seed      # seed (~380 rows); force-reseeds if already present
./scripts/mc demo status    # row counts per table
./scripts/mc demo clear     # remove ONLY sf-demo-tagged rows
```

Equivalents:

```bash
pnpm run demo:seed          # same as mc demo seed
pnpm run demo:clear
npx convex run seedFactoryDemo:run '{"force":true}'
npx convex run seedFactoryDemo:status
npx convex run seedFactoryDemo:clear '{}'
```

`clear` never touches functional (non-demo) data. Demo rows are tagged `seedTag=sf-demo` and removable in one command. See [docs/software-factory/DEMO.md](docs/software-factory/DEMO.md) for the full seed inventory.

**Knowledge graph (Memory → Graph tab):** import Agentic-KB Graphify output once per backend:

```bash
pnpm run import:knowledge-graph:demo
```

Requires a local `~/Agentic-KB` clone (or set `AGENTIC_KB_PATH`). Then open [/v2/memory](http://localhost:5199/v2/memory) → **Graph**.

**Health check:**

```bash
cd ~/worktrees/sf-90-demo && npx convex run seedFactoryDemo:status '{}'
# expect: "seeded": true, "totalRows": ~380, "projectSlug": "sf-demo"
```

### Demo pages worth clicking

| URL | What you'll see |
|-----|-----------------|
| [/v2/home](http://localhost:5199/v2/home) | Overview — agents working, in progress, approvals, blocked, spend |
| [/v2/analytics](http://localhost:5199/v2/analytics) | KPIs, bars, heatmap |
| [/v2/skills](http://localhost:5199/v2/skills) | Context registry (6 demo packages) |
| [/v2/tasks](http://localhost:5199/v2/tasks) | Kanban across all 9 task states |
| [/v2/memory](http://localhost:5199/v2/memory) → Graph | Agentic-KB knowledge graph (222 nodes after import) |
| Audit, QC Dashboard, Agents | All populated with Atlas Checkout narrative data |

After seeding, expect Overview metrics like **5 agents working / 4 in progress / 3 pending approvals / 2 blocked**.

### Critical caveats

1. **Do not run `pnpm run dev` from the main checkout while the demo backend is up.** Both use the same local Convex instance on port `3210`. Whichever `convex dev` process wins redeploys its branch's functions and can break the other.
2. **The backend is ephemeral.** If `convex dev` stops, the UI shows skeleton/pulse loaders forever — it looks like "no data". Fix: restart Terminal 1, then hard-refresh the browser (`⌘⇧R`).
3. **Use port 5199 for the demo UI.** Port `5173` may be an unrelated project. Port `5180` (main checkout vite) may also show v2 + data if demo seed enabled global feature flags, but `5199` is the intended sf-19 UI with registry evals.
4. **`mc demo` lives in the sf-90-demo worktree only.** Running `./scripts/mc demo seed` from the main checkout will fail with "Unknown command: demo".
5. **Demo seed enables global feature flags** (`ui.shell.v2`, `context.registry`, etc.). `mc demo clear` removes demo rows but leaves those flags enabled.

### Troubleshooting the demo

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Skeleton loaders, no numbers | Convex backend down | `cd ~/worktrees/sf-90-demo && npx convex dev` |
| Old shell, no `/v2/*` routes | Wrong port or flags off | Use `:5199` with `VITE_FLAG_UI_SHELL_V2=true` |
| Empty tables, v2 shell loads | Demo not seeded | `./scripts/mc demo seed` from sf-90-demo |
| Intermittent breakage | Two `convex dev` processes fighting | Kill extra processes; keep only sf-90-demo backend |
| "Unknown command: demo" | Ran from main checkout | `cd ~/worktrees/sf-90-demo` first |

---

## Architecture

- **UI:** React 18 + TypeScript + Vite → http://localhost:5173 (dev) or http://localhost:5199 (demo)
- **Backend:** Convex (serverless functions + database; no Express, no REST API)
- **Orchestration:** Hono server (coordinator loop + agent runtime) → http://localhost:4100
- **CLI:** `mc` command (see `scripts/mc`). Diagnostics: `./scripts/mc-doctor.sh`
- **Monorepo:** pnpm workspaces + Turborepo (`apps/`, `packages/`, `convex/`)

## CLI Usage

```bash
mc doctor              # Health check
mc status              # System status
mc run feature-dev     # Start workflow
mc tasks INBOX         # List tasks
mc claim               # Claim next task
mc flags list          # Feature flags
mc skill lint          # Lint SKILL.md files
```

Demo-specific commands (`mc demo seed|clear|status`) are available in the `sf-90-demo` worktree only.

## Workflows

- **feature-dev:** Plan → Implement → Test → PR
- **bug-fix:** Triage → Fix → Verify → PR
- **security-audit:** Scan → Prioritize → Fix → Verify
- **code-review:** Analyze → Security → Style → Approve

## Key Features

- Multi-agent workflows (YAML-defined)
- Task state machine (INBOX → ASSIGNED → IN_PROGRESS → REVIEW → NEEDS_APPROVAL → BLOCKED → DONE → CANCELED)
- Auto-approval for LOW risk tasks; human approval for YELLOW/RED
- Software Factory v2 operator shell (feature-flagged: `ui.shell.v2`)
- Context registry and manifest locking (`context.registry`)
- Work order delivery control plane (`delivery.workorders`)
- Structured logging, exponential backoff, idempotency keys on creates

## Documentation

- [Run Commands](docs/guides/RUN.md) — Local dev setup and seeding
- [Software Factory Demo](docs/software-factory/DEMO.md) — Full demo seed inventory
- [Creating Plugins](docs/CREATING_PLUGINS.md) — Skills, rules, and registry packages ([Tessl model](https://docs.tessl.io/create/creating-plugins))
- [Context Manifests](docs/CONTEXT_MANIFESTS.md) — Lock and install context packages
- [Feature Flags](docs/FEATURE_FLAGS.md) — Flag keys and env overrides
- [Runbook](docs/MISSION_CONTROL_RUNBOOK.md) — Operations, E2E, CI
- [Troubleshooting](docs/guides/TROUBLESHOOTING.md) — Diagnostics and common fixes
- [Setup Guide](docs/BOOT_CONTRACT.md)
- [Workflows](docs/WORKFLOWS.md)
- [PRD](docs/PRD_V2.md) — Product requirements and roadmap

## License

MIT
