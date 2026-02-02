# @mission-control/agent-runner

Minimal agent loop for Mission Control: register, heartbeat, claim tasks, start work. Use for testing or as a reference for OpenClaw integration.

## Run from repo root

Requires `CONVEX_URL` or `VITE_CONVEX_URL` (e.g. from `.env.local`).

```bash
# Default: Scout (INTERN, CUSTOMER_RESEARCH, SEO_RESEARCH)
pnpm run agent:run

# Named presets
pnpm run agent:run:scout   # Scout
pnpm run agent:run:scribe # Scribe (INTERN, DOCS, CONTENT)

# Custom
AGENT_NAME=MyAgent AGENT_ROLE=SPECIALIST AGENT_TYPES=CONTENT,SOCIAL pnpm run agent:run
```

## Env vars

| Var | Default | Description |
|-----|---------|-------------|
| CONVEX_URL / VITE_CONVEX_URL | — | Convex deployment URL (required) |
| AGENT_NAME | Scout | Agent name (must match seed or register new) |
| AGENT_ROLE | INTERN | INTERN \| SPECIALIST \| LEAD |
| AGENT_WORKSPACE | /tmp/mc-agent-{name} | Workspace path for registration |
| AGENT_TYPES | CUSTOMER_RESEARCH,SEO_RESEARCH | Comma-separated task types |
| AGENT_EMOJI | — | Optional emoji |
| HEARTBEAT_INTERVAL_MS | 900000 | Heartbeat interval (15 min) |

## Behavior

1. **Register** — If no agent exists with `AGENT_NAME`, calls `api.agents.register`; otherwise uses existing.
2. **Loop** — Every `HEARTBEAT_INTERVAL_MS`:
   - Call `api.agents.heartbeat`.
   - Process `pendingNotifications` (mark all read).
   - If any **ASSIGNED** task → post work plan, transition to IN_PROGRESS.
   - Else if any **claimable** INBOX task → call `api.tasks.assign` (claim).
   - Else log HEARTBEAT_OK.

## OpenClaw

For full OpenClaw agents, use this as a reference and implement the same flow inside your agent runtime (with SOUL.md, memory, and real work). SOUL examples: `docs/openclaw-bootstrap/soul-examples/`.
