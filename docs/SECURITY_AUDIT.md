# Mission Control Security Audit Checklist

Last updated: 2026-02-09

Aligned with [OpenClaw Security Audit Guidance](https://docs.openclaw.ai/gateway/security).

## 1. Inbound Access

| Check | Status | Notes |
|---|---|---|
| DM messages treated as untrusted input | Implemented | Policy engine flags `inputTrustLevel: UNTRUSTED` for DM sources |
| Input sanitization before processing | Partial | Convex validators handle type safety; no content sanitization yet |
| Rate limiting on external inputs | Not implemented | Future: add rate limiting to webhook/bot endpoints |
| Bot command authentication | Implemented | Telegram bot validates chat context |
| API key rotation schedule | Not implemented | Manual process; needs automation |

## 2. Tool Blast Radius

| Check | Status | Notes |
|---|---|---|
| Risk classification for all tools | Implemented | GREEN/YELLOW/RED classification in `policy-engine/rules.ts` |
| Destructive commands blocked by default | Implemented | `shellBlocked` allowlist + RED classification for `rm_rf`, `drop_table`, etc. |
| Directory dump prevention | Implemented | `DIRECTORY_DUMP_PATTERNS` in safety defaults |
| Secret exposure prevention | Implemented | `SECRET_PATTERNS` regex array checks outbound content |
| Approval gates for RED tools | Implemented | `NEEDS_APPROVAL` decision for all RED-risk tool calls |
| Tool allowlists maintained | Implemented | `ALLOWLISTS` in policy-engine with shell/network/filesystem categories |

## 3. Network Exposure

| Check | Status | Notes |
|---|---|---|
| Network domain allowlists | Implemented | Only approved domains in `ALLOWLISTS.network` |
| No direct network exposure from agents | Implemented | Agents act through Convex actions; no direct socket access |
| External API calls audited | Partial | Tool calls logged in `toolCalls` table; need better external call tracking |
| Webhook endpoints authenticated | Partial | Webhook signatures not fully validated |

## 4. Credential Storage

| Check | Status | Notes |
|---|---|---|
| `.env` files not committed | Implemented | `.gitignore` includes `.env*` |
| API keys in environment variables only | Implemented | Convex env vars for runtime; `.env` for local dev |
| No hardcoded credentials in code | To verify | Manual review needed; CI could add pattern check |
| Secret patterns blocked in output | Implemented | `SECRET_PATTERNS` in safety defaults |
| No credentials in memory/logs | Partial | Memory package should filter before writes |

## 5. Model Hygiene

| Check | Status | Notes |
|---|---|---|
| Model selection validated | Implemented | Model router validates provider + model pairs |
| Fallback chains defined | Implemented | `packages/model-router` supports fallback providers |
| Cost estimation before calls | Implemented | `CostEstimator` in model-router |
| Budget enforcement per run | Implemented | Per-agent daily and per-run caps in policy-engine |
| Model output not trusted blindly | Partial | Agent outputs go through policy checks before external actions |

## 6. Agent Identity Governance

| Check | Status | Notes |
|---|---|---|
| IDENTITY.md required for all agents | Implemented | Identity validator + compliance dashboard |
| SOUL.md required for lead/major agents | Implemented | Scanner flags missing souls; CI checks templates |
| Soul changes audited | Implemented | `identity.upsert` logs audit event on soul hash change |
| Identity validation on registration | Implemented | `convex/identity.ts` validates required fields |
| Templates derived from OpenClaw | Implemented | `templates/IDENTITY.md`, `SOUL.md`, `TOOLS.md` |

## 7. Communication Safety

| Check | Status | Notes |
|---|---|---|
| No streaming to external surfaces | Implemented | `telegraph.sendMessage` rejects streaming/partial for TELEGRAM channel |
| Final replies only externally | Implemented | `TelegramTelegraphProvider.isPartialOrStreaming()` check |
| Private data not shared in groups | Policy | Documented in SOUL.md template; runtime check via `BLOCK_PRIVATE_DATA_SHARING` |
| Agent is not user's voice | Policy | Documented in SOUL.md; agents warned in shared spaces |

## 8. Session Security

| Check | Status | Notes |
|---|---|---|
| Session bootstrap required | Implemented | `convex/sessionBootstrap.ts` with soul/project/memory loading |
| Agent state reset between sessions | By design | Agents are fresh instances; continuity via files/memory |
| Memory files read on session start | Implemented | Bootstrap reads today + yesterday + long-term memory |
| Safety reminders included in context | Implemented | Bootstrap payload includes `safetyReminders` array |

## 9. Operator Controls

| Check | Status | Notes |
|---|---|---|
| Emergency pause available | Implemented | `PAUSED`, `DRAINING`, `QUARANTINED` operator modes |
| Per-agent quarantine | Implemented | Agent status controls in UI and API |
| Approval escalation for high risk | Implemented | Dual-control path for RED approvals |
| Audit trail for all actions | Implemented | `taskEvents`, `activities`, `taskTransitions` tables |

## 10. CI/CD Security

| Check | Status | Notes |
|---|---|---|
| Type checking in CI | Implemented | `pnpm run ci:typecheck` |
| Tests in CI | Implemented | `pnpm run ci:test` |
| Identity/soul compliance in CI | Implemented | Template existence + required sections check |
| Dependency audit | Not implemented | Add `pnpm audit` to CI pipeline |
| No `.env` files in commits | Manual | Add pre-commit hook or CI check |

## Remediation Priority

1. **High**: Add input content sanitization for DM/webhook inputs
2. **High**: Add `pnpm audit` to CI for dependency vulnerability scanning
3. **Medium**: Add rate limiting to external-facing endpoints
4. **Medium**: Implement API key rotation automation
5. **Medium**: Add pre-commit hook to block `.env` files
6. **Low**: Improve external API call auditing in tool call logs
7. **Low**: Add webhook signature validation for all providers
