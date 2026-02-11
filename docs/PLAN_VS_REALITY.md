# Plan vs Reality

Last updated: 2026-02-09

Gap analysis comparing all planning documents against current implementation.

## Sources Reviewed

- `docs/planning/IMPLEMENTATION_PLAN.md`
- `docs/planning/IMPLEMENTATION_PLAN_V1.3.md`
- `docs/planning/IMPLEMENTATION_PLAN_V1.4.md`
- `docs/planning/IMPLEMENTATION_ROADMAP_V1.6.md`
- `docs/INTELLIGENCE_LAYER_PLAN.md`
- `docs/PRD_V2.md`
- `progress.txt`

## Gap Matrix

### Core Control Plane (Existing)

| Capability | Plan Status | Reality | Gap |
|---|---|---|---|
| Deterministic task lifecycle | Fully planned | Implemented (`convex/tasks.ts`, 9 states) | Minor: legacy duplicate variants may exist |
| Risk policy + approvals | Fully planned | Implemented (`convex/policy.ts`, `convex/approvals.ts`) | Need stricter authz; escalation target routing |
| Full timeline/audit | Fully planned | `taskEvents` stream exists; task drawer consumes it | Backfill remaining producers; standardize on `taskEvents` |
| Smart assignment | Planned | `convex/taskRouter.ts` with scoring | Needs operator visibility dashboard |
| Multi-executor automation | Planned | `executionRequests` + `executorRouter` exist | Contains stubs; needs rollout gating |
| Search + command center | Planned | Search + command palette implemented | Add saved-view search/favorites |
| Operator controls | Planned | Global/project modes implemented | Need richer runbooks |
| Saved views + watch | Planned | Implemented with UI toggles | Add notification fanout for approvals/agents |
| Orchestration server | Planned | `apps/orchestration-server` exists (Hono) | Partially integrated; some stubs |
| Coordinator | Planned | `packages/coordinator` with decomposition, delegation | Working; needs production hardening |
| Context router | Planned | `packages/context-router` Tier 1 rules | No Tier 2 LLM classifier yet |
| Model router | Planned | `packages/model-router` Claude provider | No OpenAI/Gemini providers yet |
| Memory system | Planned | `packages/memory` with 3 tiers | Integrated with agent-runtime |
| Agent runtime | Planned | `packages/agent-runtime` | Functional; persona loading works |
| OpenClaw SDK | Planned (V1.3) | `packages/openclaw-sdk` v1.0.0 | Complete |
| Telegram bot | Planned | `packages/telegram-bot` v0.1.0 | Functional but early |

### New Capabilities (Upgrade)

| Capability | Plan Status | Reality | Gap |
|---|---|---|---|
| IDENTITY.md support | Not planned | No implementation | Full build needed: templates, validator, scanner, UI |
| SOUL.md governance | Partially planned (soul examples exist) | `docs/openclaw-bootstrap/soul-examples/` has 4 examples; `agents.soulVersionHash` field exists | Need: per-agent SOUL.md storage, validation, change audit, UI |
| TOOLS.md support | Not planned | No implementation | Full build needed: template, storage, UI |
| Session bootstrap | Not planned | No implementation | Build `convex/sessionBootstrap.ts` per AGENTS template |
| Safety defaults (OpenClaw) | Partially in policy-engine | `SECRET_PATTERNS` exist in shared; risk classification works | Add: directory dump block, streaming block, DM trust levels |
| CEO agent role | Not planned | Agent roles are INTERN/SPECIALIST/LEAD only | Add CEO to enum; build org assignments |
| Org hierarchy model | Partially planned (OrgView exists) | `OrgView.tsx` exists with basic org chart | Need: orgAssignments table, positional roles, per-project mapping |
| Voice / TTS | Not planned | No implementation | Full build: TTSProvider, ElevenLabs, avatar, Convex actions, UI |
| Telegraph comms | Not planned | `messages` table exists for task comments | Full build: telegraphMessages/Threads tables, provider, UI inbox |
| Meeting orchestration | Not planned | No implementation | Full build: MeetingProvider, manual provider, Convex functions, UI |
| CI identity compliance | Not planned | CI has typecheck + test only | Add compliance check job |

### Agent Personas (Existing but Incomplete)

| Agent File | Has YAML? | Has Soul Example? | Needs IDENTITY.md? | Needs SOUL.md? |
|---|---|---|---|---|
| bj | Yes | Yes (`docs/openclaw-bootstrap/soul-examples/BJ.md`) | Yes | Yes (convert from example) |
| sofie | Yes | Yes | Yes | Yes |
| scout | No YAML | Yes | Yes | Yes |
| scribe | No YAML | Yes | Yes | Yes |
| storyteller | Yes | No | Yes | Yes |
| qa | Yes | No | Yes | Yes |
| learner | Yes | No | Yes | Yes |
| compliance | Yes | No | Yes | Yes |
| strategist | Yes | No | Yes | Yes |
| finance | Yes | No | Yes | Yes |
| designer | Yes | No | Yes | Yes |
| operations | Yes | No | Yes | Yes |
| coder | Yes | No | Yes | Yes |
| research | Yes | No | Yes | Yes |
| coordinator | Yes | No | Yes | Yes |

### Schema Tables (Existing vs Needed)

| Table | Exists? | Needs Update? |
|---|---|---|
| projects | Yes | No |
| agents | Yes | Add CEO to agentRole enum |
| tasks | Yes | No |
| taskTransitions | Yes | No |
| taskEvents | Yes | No |
| approvals | Yes | No |
| runs | Yes | No |
| toolCalls | Yes | No |
| messages | Yes | No |
| activities | Yes | No |
| alerts | Yes | No |
| operatorControls | Yes | No |
| savedViews | Yes | No |
| watchSubscriptions | Yes | No |
| orgAssignments | **No** | **New table needed** |
| agentIdentities | **No** | **New table needed** |
| telegraphMessages | **No** | **New table needed** |
| telegraphThreads | **No** | **New table needed** |
| meetings | **No** | **New table needed** |
| voiceArtifacts | **No** | **New table needed** |

### UI Components (Existing vs Needed)

| Component | Exists? | Needs Update? |
|---|---|---|
| App.tsx | Yes | Add new view routing |
| Sidebar.tsx | Yes | Add new nav items |
| OrgView.tsx | Yes | Add org position display, role assignment |
| AgentDashboard.tsx | Yes | Minor: show identity info |
| IdentityDirectoryView.tsx | **No** | **New component** |
| SoulDetailModal.tsx | **No** | **New component** |
| IdentityComplianceDashboard.tsx | **No** | **New component** |
| VoicePanel.tsx | **No** | **New component** |
| TelegraphInbox.tsx | **No** | **New component** |
| TelegraphThread.tsx | **No** | **New component** |
| MeetingsView.tsx | **No** | **New component** |
| MeetingDetailModal.tsx | **No** | **New component** |

## Summary

- **Existing control plane** is solid (state machine, policy, approvals, monitoring all working).
- **Identity/Soul governance** is the largest gap -- no templates, no validator, no scanner, no UI.
- **Communications** (Telegraph + Voice + Meetings) are entirely new subsystems.
- **Org model** needs expansion from flat roles to hierarchical project-scoped positions.
- **Safety defaults** partially exist but need OpenClaw-specific rules added.
- **13 agent YAMLs** exist but none have proper IDENTITY.md or SOUL.md files.
