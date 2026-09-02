# Mission Control — Troubleshooting Index

**Canonical reference for operations and incident response.** All guides assume the current architecture: Convex backend (no Express), Hono orchestration server, React/Vite UI.

---

## Architecture (current)

- **UI:** React 18 + Vite → `pnpm run dev:ui` → http://localhost:5173
- **Backend:** Convex (serverless) → `npx convex dev` → no local API port
- **Orchestration:** Hono server → `pnpm run dev:orchestration` → http://localhost:4100
- **CLI:** `scripts/mc` → `mc doctor`, `mc status`, `mc tasks`, etc.

---

## Quick diagnostics

| Command | Purpose |
|--------|--------|
| `./scripts/mc-doctor.sh` | Full health check (env, Convex, agents, tasks) |
| `./scripts/mc-smoke.sh` | Fast sanity check (deps, schema, workflows) |
| `curl http://localhost:4100/health` | Orchestration server liveness |
| `npx convex dashboard` | Convex deployment and logs |

---

## Common issues

### Convex URL not set or wrong

- **Symptom:** UI loads but data never appears; "Convex URL is required" in orchestration logs.
- **Fix:** Run `npx convex dev` once; it writes the deployment URL. Copy it to `.env.local` as `CONVEX_URL` and `VITE_CONVEX_URL` (UI needs the latter at build time for Docker).

### Orchestration server: Unauthorized on /status or /tick

- **Symptom:** 401 when calling `/status`, `/tick`, or `/agents/*`.
- **Fix:** Set `ORCHESTRATION_API_TOKEN` (or `MC_API_TOKEN`) in the server env and send `Authorization: Bearer <token>` on requests. Leave unset for local dev (no auth).
- The `/gateway/ws` WebSocket upgrade is gated by the same bearer. Browsers cannot set headers on a WebSocket, so the token is presented by whatever proxies the UI to the server: the Vite dev proxy injects it from `ORCHESTRATION_API_TOKEN` in the UI's env, and a production reverse proxy must add the same `Authorization` header on `/gateway/ws`. A `401` on the upgrade means the proxy in front of the UI is not adding it.

### Gateway / discovery: "Gateway URL is not set"

- **Symptom:** Discovery returns empty or error; gateway proxy fails.
- **Fix:** Set the Gateway URL in Mission Control UI (Gateway settings) or in Convex env as `OPENCLAW_GATEWAY_URL`. Set `GATEWAY_TOKEN` (or `OPENCLAW_GATEWAY_TOKEN` in Convex) for auth.

### Heartbeat recovery quarantining agents

- **Symptom:** Agents go QUARANTINED shortly after start.
- **Fix:** Heartbeat recovery runs only when `HEARTBEAT_RECOVERY_ENABLED=true` in Convex env. If you enabled it, set `HEARTBEAT_STALE_MINUTES` (e.g. 5) and optionally `HEARTBEAT_IGNORE_NEVER=true` so agents that have never sent a heartbeat are skipped.

### UI or orchestration: dependency / build errors

- **Fix:** From repo root: `pnpm install` then `pnpm run build` (or `pnpm run dev`). For orchestration only: `pnpm run dev:orchestration`.

---

## Related guides

- [Runbook](../MISSION_CONTROL_RUNBOOK.md) — Operations, E2E, CI
- [Deploy now](DEPLOY_NOW.md) — Telegram + Scout deployment
- [Frontend guidelines](../FRONTEND_GUIDELINES.md) — UI and design tokens
