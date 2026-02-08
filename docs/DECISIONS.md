# Mission Control Decisions

Last updated: 2026-02-08

This document records major structural decisions made during the intelligence-layer upgrade.

## D-001: Convex remains the canonical runtime API and source of truth

- **Status:** Accepted
- **Context:** UI, orchestration runtime, and integrations already rely on Convex functions and tables.
- **Decision:** Keep Convex as the single operational backend; do not introduce a parallel REST/GraphQL surface for core flows.
- **Why:** Lowest migration risk, strongest consistency, fastest path to shippable v1.
- **Tradeoff:** Strong coupling to Convex contracts; mitigated by clearer docs and typed query/mutation usage.

## D-002: Task status writes must flow through `tasks.transition`

- **Status:** Accepted
- **Context:** Direct patching of `task.status` bypasses state-machine invariants.
- **Decision:** `tasks.update` routes status changes through `api.tasks.transition`.
- **Why:** Preserves transition validity, actor permissions, and required-artifact checks.
- **Tradeoff:** Some edits now fail fast if prerequisites are missing; this is intentional.

## D-003: Policy explainability is a first-class contract

- **Status:** Accepted
- **Context:** Operators needed clear answers to “why green/yellow/red” and “why blocked”.
- **Decision:** Added `policy.explainTaskPolicy` to return decision, risk, triggered rules, required approvals, and remediation hints.
- **Why:** Improves trust and operator speed under pressure.
- **Tradeoff:** Slightly larger payloads and stricter contract expectations.

## D-004: Simulation before execution for high-risk transitions

- **Status:** Accepted
- **Context:** Operators lacked a no-side-effect precheck.
- **Decision:** Added `tasks.simulateTransition` dry-run endpoint and wired it into task drawer policy UI.
- **Why:** Reduces accidental invalid transitions and approval churn.
- **Tradeoff:** Adds one more preflight path to maintain; test coverage offsets risk.

## D-005: Operator control surfaces over hidden automation

- **Status:** Accepted
- **Context:** v1 requires trust and controllability over autonomous behavior.
- **Decision:** Added Agent Registry + controls (`Activate`, `Pause`, `Drain`, `Quarantine`) and squad-level actions.
- **Why:** Explicit controls are safer than implicit background behavior.
- **Tradeoff:** More operator-visible complexity; mitigated by clear status semantics.

## D-006: Search contract normalization across UI surfaces

- **Status:** Accepted
- **Context:** Command palette/search bar had drift from backend search response shape.
- **Decision:** Unified both UIs on `search.searchAll` grouped results (tasks/approvals/agents/messages).
- **Why:** Prevents brittle UI adapters and broken navigation paths.
- **Tradeoff:** Requires synchronized frontend/backend evolution for search fields.

## D-007: CI quality lane uses explicit workspace commands

- **Status:** Accepted
- **Context:** `turbo` commands are currently unreliable in this environment due TLS/keychain setup.
- **Decision:** Added explicit `ci:*` scripts and GitHub Actions workflow using deterministic package commands.
- **Why:** Reliable quality gates are mandatory for shipping confidence.
- **Tradeoff:** More verbose scripts, but easier to debug and maintain.

## D-008: Canonical task timeline uses `taskEvents`

- **Status:** Accepted
- **Context:** Timeline/audit data was previously stitched from multiple tables with drifted contracts.
- **Decision:** Added `taskEvents` as canonical event stream and wired task transitions, approvals, and runs into it.
- **Why:** Gives operators one deterministic event feed for incident review and export.
- **Tradeoff:** Slightly higher write volume; accepted for audit clarity.

## D-009: Approval safety upgrades require escalation + dual control

- **Status:** Accepted
- **Context:** High-risk approvals needed better SLA handling and stronger decision integrity.
- **Decision:** Added `ESCALATED` approval status, cron-based overdue escalation, and 2-person approval for RED risk actions.
- **Why:** Reduces stalled high-risk actions and prevents single-actor approval mistakes.
- **Tradeoff:** More workflow complexity in Approvals Center; mitigated with explicit UI cues.

## D-010: Operator posture control is a first-class runtime gate

- **Status:** Accepted
- **Context:** Existing controls were mostly per-agent and did not provide system-wide containment semantics.
- **Decision:** Added `operatorControls` mode (`NORMAL`, `PAUSED`, `DRAINING`, `QUARANTINED`) enforced by policy and run start checks.
- **Why:** Gives operators explicit incident containment with deterministic behavior.
- **Tradeoff:** Can block automation unexpectedly if mode is not visible; mitigated with clear UI and remediation messages.

## D-011: Saved views and watch subscriptions are persisted server-side

- **Status:** Accepted
- **Context:** Operators needed persistent workflow context instead of reapplying ad-hoc filters.
- **Decision:** Added `savedViews` + `watchSubscriptions` with ownership/shared semantics and UI controls in Kanban/task drawer.
- **Why:** Improves repeatability and reduces operator friction in daily usage.
- **Tradeoff:** Introduces user-state data lifecycle concerns; follow-up needed for cleanup and notification fanout.

## Deferred Decisions

- Full authn/authz rollout for project-scoped access checks.
- Unified event store to replace partial overlap across `activities`, `taskTransitions`, and run/tool logs.
- End-to-end executor routing rollout (currently partial/stubbed in parts of stack).
