# DEFAULTS.md - Assumptions & Default Values

This document captures all assumptions and default values chosen for the Mission Control bootstrap kit.

---

## Architecture Defaults

| Decision | Default | Rationale |
|----------|---------|-----------|
| Storage MVP | Convex | Realtime, serverless, fast iteration |
| Storage Scale | Postgres + Prisma | Industry standard, easy migration |
| Storage Interface | Abstracted | Swap backends without code changes |
| API Framework | Fastify | Fast, typed, good DX |
| UI Framework | React + Vite | Lightweight, fast builds |
| UI Components | shadcn/ui | Consistent with SellerFi |
| Job Queues | BullMQ + Redis | Reliable, scalable |
| Monorepo | pnpm + Turborepo | Modern, fast, proven |

---

## Agent Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Default role | SPECIALIST | Most common use case |
| Default status | ACTIVE | Ready to work |
| Budget daily (Intern) | $2.00 | Minimal risk |
| Budget daily (Specialist) | $5.00 | Standard worker |
| Budget daily (Lead) | $12.00 | More complex tasks |
| Budget per-run (Intern) | $0.25 | Prevents expensive runs |
| Budget per-run (Specialist) | $0.75 | Standard cap |
| Budget per-run (Lead) | $1.50 | Higher ceiling |
| Can spawn (Intern) | false | No sub-agents |
| Can spawn (Specialist) | true | Within limits |
| Max sub-agents | 3 | Per parent task |
| Spawn depth | 2 | Max nesting |
| Sub-agent TTL | 6 hours | Auto-cleanup |
| Error streak threshold | 5 | Before quarantine |

---

## Task Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Initial status | INBOX | Awaiting assignment |
| Default priority | 3 (normal) | 1=critical, 4=low |
| Max review cycles | 3 | Before auto-block |
| Work plan bullets | 3-6 | Required for IN_PROGRESS |
| Budget (CONTENT) | $6.00 | |
| Budget (SOCIAL) | $2.00 | |
| Budget (EMAIL_MARKETING) | $4.00 | |
| Budget (CUSTOMER_RESEARCH) | $5.00 | |
| Budget (SEO_RESEARCH) | $4.00 | |
| Budget (ENGINEERING) | $8.00 | |
| Budget (DOCS) | $3.00 | |
| Budget (OPS) | $3.00 | |

---

## Transition Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| REVIEW → DONE authority | Human only | Agents cannot mark DONE |
| Auto-transition on loop | → BLOCKED | With Loop Summary |
| Auto-transition on budget | → NEEDS_APPROVAL | Request override |
| Idempotency window | 5 minutes | Same transition = no-op |

---

## Approval Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Default expiration | 24 hours | Auto-expire if no decision |
| RED actions | Always require approval | Regardless of role |
| YELLOW for Intern | Requires approval | |
| YELLOW for Specialist+ | Allowed within limits | |
| Budget override | Creates approval | Doesn't auto-approve |

---

## Loop Detection Defaults

| Metric | Threshold | Notes |
|--------|-----------|-------|
| Comments in 30 min | > 20 | Task blocked |
| Review cycles | > 3 | Task blocked |
| Agent ping-pong (10 min) | > 8 exchanges | Task blocked |
| Tool retries (same error) | ≥ 3 | Agent quarantined |

---

## Notification Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Delivery channel | Telegram | First integration |
| Max retry attempts | 5 | With backoff |
| Backoff base | 30 seconds | 30s, 1m, 2m, 4m, 8m |
| Expiration | 24 hours | Give up after |
| Deduplication window | 5 minutes | Prevent duplicate sends |

---

## Worker Defaults

| Worker | Interval | Notes |
|--------|----------|-------|
| Notification delivery | 5 seconds | Poll pending |
| Budget monitor | 1 minute | Check all agents |
| Loop detector | 30 seconds | Check patterns |
| Standup generator | Check hourly, run at 9 AM | Timezone-aware |
| Approval expirer | 1 minute | Check expired |

---

## Policy Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Shell allowlist | Common safe commands | See POLICY_V1.md |
| File write paths | output/, docs/, memory/ | Within workspace |
| Network allowlist | GitHub, Google, APIs | See POLICY_V1.md |
| Secrets in logs | NEVER | Always redact |
| Tool input/output logs | Preview only (500 chars) | Summarize, don't dump |
| Max active agents | 30 | Global limit |

---

## API Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Pagination limit | 50 | Max 200 |
| Rate limit (mutate) | 100/min | Per agent |
| Rate limit (events) | 1000/min | Per agent |
| Rate limit (read) | 300/min | Per client |
| Auth method | Bearer token | Per-agent tokens |
| Idempotency header | X-Idempotency-Key | Optional but recommended |

---

## Standup Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Time | 9:00 AM | Local timezone |
| Timezone | America/Los_Angeles | Configurable |
| Lookback | 24 hours | Previous day |
| Max completed tasks shown | 10 | Truncate with count |
| Max alerts shown | 5 | Most recent |

---

## UI Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Task board view | Kanban | By status |
| Real-time updates | 30 second poll | Or Convex subscriptions |
| Theme | Light | System preference |
| Default task filter | INBOX, ASSIGNED, IN_PROGRESS, REVIEW | Active tasks |

---

## Security Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Audit logging | Enabled | All mutations |
| Redaction | Enabled | Secrets, paths |
| Token expiration | 7 days | Configurable |
| Admin routes | Require ADMIN role | |
| Webhook signatures | Required (prod) | HMAC-SHA256 |

---

## Assumptions Made

1. **Single operator initially** — Notifications go to one human
2. **Telegram first** — Primary notification channel
3. **USD currency** — All budgets in dollars
4. **English language** — UI and content
5. **Pacific timezone** — Default for standups
6. **Human approves DONE** — Agents propose, humans dispose
7. **Trust but verify** — Agents self-review, humans spot-check
8. **Fail safe** — When uncertain, block rather than proceed
9. **Audit everything** — Better to have too much history
10. **Idempotent by default** — Safe retries everywhere

---

## Configuration Override

All defaults can be overridden via:

1. **Environment variables** — For deployment config
2. **Policy records** — For runtime policy changes
3. **Agent config** — For per-agent overrides
4. **Task metadata** — For per-task overrides

Priority: Task > Agent > Policy > Environment > Defaults
