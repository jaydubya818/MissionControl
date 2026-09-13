# Relay Mission Plan revision 2 draft

This is the reviewed contract direction for the next Relay Mission Spec and Plan revision. It is not approved or released. Mission predecessor gates come from the approved Plan blueprint, so WorkOrder-only dependency edits are insufficient.

## Common contract rules

- Use `pnpm@9.0.0` exclusively, require a complete committed `pnpm-lock.yaml`, and prohibit `package-lock.json`.
- Run a structural package-policy check, typecheck, production build, focused requirement-linked tests, and browser or security checks where the WorkOrder claims those outcomes.
- Use schema-v2 enforced verification with a separate exact-candidate Verification Attempt.
- Give every required evidence category its own deterministic command. Do not duplicate one generic `pnpm test` command under multiple labels.
- Permit only the schema, migration, dependency, test, browser, or local-runner surfaces actually required by that WorkOrder.
- Keep `docs/RELAY-V1-SPEC.md`, environment secrets, CI workflows, generated build/test output, `node_modules`, and npm lockfiles outside mutation scope.
- Keep all mutating WorkOrders serial because they share one broad Relay code scope. Enforce at most two explicitly read-only qualifications after their predecessor handoffs exist.
- Standardize health as `HEALTHY | DEGRADED | UNAVAILABLE | UNKNOWN`.

## Corrected blueprint order

1. WO-001 Repository + Technical Foundation
2. WO-002 Domain Model + Database, after WO-001
3. WO-003 Authentication + Accounts, after WO-001 and WO-002
4. WO-004 Agent Identity + Runtime Connections, after WO-002 and WO-003
5. WO-005 Capability Registry + Permission Engine, after WO-004
6. WO-008 Dashboard Shell + Navigation + Design System, after WO-001
7. WO-007 Activity + Audit + Execution Receipts, after WO-002, WO-003, and WO-008
8. WO-006 MCP Gateway + Dynamic Tool Projection, after WO-005, WO-007, and WO-008
9. WO-009 Memory Service + Memory UI, after WO-005, WO-007, and WO-008
10. WO-010 Connector Framework + First Connector, after WO-003, WO-005, WO-007, and WO-008
11. WO-011 Sandbox Service, after WO-005, WO-007, and WO-008
12. WO-015 Browser/Computer Observer + Runtime Presence, after WO-004, WO-005, WO-007, and WO-008
13. WO-012 Performance Qualification, after all applicable implementation predecessors
14. WO-013 Security Qualification, after Authentication, Capability, MCP, Activity/Audit, Connector, and Sandbox
15. WO-014 Golden-Path E2E Qualification, last

## WorkOrder contract changes

| WorkOrder | Required revision outcome | Mandatory independent checks |
| --- | --- | --- |
| WO-001 | Preserve revision 3 while the current recovery runs. Add a frozen-install evidence check only in a later approved revision if dependency preparation is not retained as authoritative acceptance evidence. | pinned-package policy, typecheck, build, live health, no runtime coupling |
| WO-002 | Permit dependency, schema, and migration changes. Own the canonical domain, tenancy/delete semantics, and seven ADRs. | typecheck, build, domain-model test, tenancy/delete test, ADR static analysis |
| WO-003 | Narrow to account auth, sessions, tenancy entry, first-run, and demo isolation. Add browser states and session recovery. | typecheck, build, auth integration, auth browser journey, secret/token policy |
| WO-004 | Narrow to agent identity, runtime attach/test/recovery, session snapshots, instruction/state split, leases, and credential-free handoff. | typecheck, build, runtime/session integration, agent/runtime browser journey |
| WO-005 | Own canonical capabilities, deny-by-default grants, short leases, generic locks, Computer control/handoff, and skill no-auto-grant. | typecheck, build, permission tests, lock tests, skill-policy tests, browser journey |
| WO-006 | Prove grant-filtered MCP projection for Claude Code, Codex CLI, and custom clients, idempotent writes, structured errors, adapters, and no secret/runtime coupling. | typecheck, build, MCP contract, MCP security scan, no-coupling scan, Developer/MCP browser journey |
| WO-007 | Separate Activity, immutable Audit, and receipts; prove durable event-to-wake-to-inbox, approvals, budgets, filtering, correlation diagnosis, and secret redaction. | typecheck, build, activity/audit test, event/wake test, security scan, browser journey |
| WO-008 | Own the full shell, honest IA, deterministic state patterns, onboarding guidance, navigation history, keyboard/accessibility, responsive layouts, health resilience, and code-owned design baseline. | typecheck, build, shell architecture test, secret scan, desktop/tablet Playwright suite |
| WO-009 | Prove tenant-scoped Memory lifecycle and explicit version conflict resolution without silent overwrite. | typecheck, build, conflict/lifecycle integration, tenancy security, Memory browser journey |
| WO-010 | Use a deterministic in-repository reference connector. Prove test-before-grant, explicit grant, health/circuit states, reconnect/revoke, token hierarchy, and no secret leakage. | typecheck, build, reference-connector integration, secret scan, Connector browser journey |
| WO-011 | Use a deterministic local reference runner. Prove create/execute/result/stop, TTL, collision behavior, isolation, denial, recovery, and secret containment. | typecheck, build, sandbox lifecycle integration, isolation security, Sandbox browser journey |
| WO-012 | Add an enforced read-only contract with one performance result per SLO for cached navigation, core page, API reads, search, UI feedback, and provider-failure navigation. | exact final-candidate benchmark commands with separate `PERFORMANCE_RESULT` receipts |
| WO-013 | Add an enforced read-only contract covering frozen install, typecheck/build/health/no-coupling, secret redaction, rate limiting, abuse controls, auth, and sandbox boundaries. | command/build/runtime/static evidence plus focused security scans and tests |
| WO-014 | Add an enforced final qualification contract with one command per criterion and exact-final-candidate performance/security reruns. | account-to-agent-to-connector-to-runtime, deny/grant/expiry, three MCP clients, Memory conflict, Sandbox collision, Activity/Audit diagnosis, accessibility, performance, and secret scans |
| WO-015 | Add the missing live Browser/Computer observer implementation owner. | one controller/two observers, denied second control, supervised handoff, reconnect/stale frames, accessibility/viewports, no secrets in evidence |

## Required browser evidence

The revised browser-bearing WorkOrders must use deterministic fixtures and capture:

- loading, first-use empty, filtered-empty, permission-denied, degraded, fatal-error, conflict, and success states
- deep-link, refresh, back/forward, resume, and retry behavior
- keyboard-only completion, visible focus, accessible labels and announcements, reduced motion, and zero serious or critical automated accessibility violations
- 1440×900, 1024×768, and 768×1024 layouts with no page-level horizontal overflow, clipped controls, or blocked primary action
- console and request failures, with correlation IDs and safe recovery actions where applicable
- confirmation that credentials, authorization headers, and secret canaries never appear in DOM, URLs, logs, screenshots, receipts, or test artifacts

## Approval boundary

Before these changes can govern execution, the Product Owner must approve:

1. Relay Mission Spec/Plan revision 2 with the corrected 15-WorkOrder blueprint.
2. The exact per-WorkOrder change budgets and verification contracts.
3. The reviewed outer repository code-scope union in `corrective-workorders.md`.

