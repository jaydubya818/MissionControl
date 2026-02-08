# ADR-001: Orchestration Architecture

**Status:** Accepted  
**Date:** 2026-02-07  
**Deciders:** Jay West (CHO)

## Context

Mission Control needs a server-side orchestration process for Phase 2. The Convex backend handles state, real-time subscriptions, and cron jobs, but cannot support:

- Long-running agent loops (Convex actions timeout at 10-15 min)
- Streaming LLM API responses (require persistent connections)
- Multi-model routing with fallback chains
- Complex agent lifecycle management (heartbeat loops, error recovery)

The question: what runtime should the orchestration server use?

## Options Considered

### Option A: Express.js Server
- **Pros:** Most familiar, largest ecosystem, well-understood patterns
- **Cons:** More boilerplate, callback-oriented, heavier dependency tree

### Option B: Hono
- **Pros:** Lightweight, fast, TypeScript-first, modern API, runs on any runtime (Node, Bun, Deno, Edge)
- **Cons:** Smaller ecosystem, less community knowledge

### Option C: Convex-Only (No External Server)
- **Pros:** No infrastructure to manage, single deployment target
- **Cons:** Action timeout limits (10-15 min) make long-running agent loops impossible, no streaming, no persistent connections

## Decision

**Use Hono** as the orchestration server framework, running as a standalone Node.js process alongside the Convex backend.

### Rationale

1. **TypeScript-first**: Aligns with the monorepo's strict TypeScript policy.
2. **Lightweight**: Minimal dependencies — the orchestration server needs request handling for webhooks and a runtime loop, not a full web framework.
3. **Runtime flexibility**: If we later deploy to Bun or edge functions, Hono ports directly.
4. **Convex remains source of truth**: The Hono server reads and writes state via `ConvexHttpClient`. It does NOT duplicate state.
5. **PRD alignment**: PRD_V2.md explicitly calls for "Express or Hono" (Section 3.1).

### Architecture

```
┌──────────────────────────────────┐
│  React Frontend (Vite)           │
│  useQuery / useMutation          │
└──────────┬───────────────────────┘
           │ WebSocket (Convex)
┌──────────▼───────────────────────┐
│  Convex Backend                  │
│  - Schema (source of truth)      │
│  - Queries / Mutations           │
│  - Cron jobs                     │
└──────────┬───────────────────────┘
           │ ConvexHttpClient
┌──────────▼───────────────────────┐
│  Hono Orchestration Server       │
│  packages/server                 │
│  - Agent Runtime (lifecycle)     │
│  - Coordinator (decomposition)   │
│  - Model Router (LLM calls)     │
│  - Memory System (learning)     │
│  - Heartbeat monitor             │
│  - Webhook receiver              │
└──────────────────────────────────┘
```

### Key Constraints

1. The Hono server MUST NOT store state locally — all state goes through Convex mutations.
2. The Hono server MUST authenticate to Convex using a service key (not user auth).
3. The Hono server deployment is a Docker container in the same Docker Compose as the UI.
4. The `packages/server` package owns the Hono app; other packages (`coordinator`, `agent-runtime`, `model-router`, `memory`) are imported as libraries.

## Consequences

- **New package**: `packages/server` with Hono as the sole framework dependency.
- **Docker Compose update**: Add a `server` service alongside `ui`.
- **New env var**: `CONVEX_URL` for the Hono server's Convex client connection.
- **Testing**: The orchestration server can be tested with Hono's built-in test client (no supertest needed).
- **NOT affected**: Frontend, Convex schema, existing cron jobs, Telegram bot.
