---
title: Factory Incident Command
status: EXPERIMENTAL
last_verified: 2026-09-06
---

# Factory Incident Command

Mission Control uses one canonical incident lifecycle:

`Clarify → Contain → Observe → Isolate → Restore → Correct → Prevent → Measure → Resolved`

The incident is a thin authority and decision aggregate. It references existing
Missions, WorkOrders, Tasks, Attempts, traces, tool calls, model routes, Factory
Versions, sandboxes, pull requests, releases, alerts, evidence envelopes, and
audit records. It does not copy or replace those source records.

## Authority

- A workspace operator with `factory.improve` may file and advance ordinary
  investigation, correction, prevention, and measurement phases.
- Containment, restoration, and resolution require `factory.approve`.
- Repository-dispatch request, execution, observation, and restoration grant
  require company-admin authority or an explicitly assigned
  `factory.incident.control` role; generic delivery approval is insufficient.
- A signed service may use only `incidents.detect` and `incidents.propose`.
  Agents cannot restore authority, resolve an incident, erase evidence, or
  mutate the immutable command log.
- Closing an alert, recovering an Attempt, or observing a healthy provider does
  not restore authority or resolve an incident.

Every transition is append-only, idempotent, and sequence-bound. Duplicate
delivery returns the existing transition. Late, skipped, repeated, or reordered
transitions fail closed. Resolved incidents are immutable.

## Containment and restoration

Containment references the exact receipts emitted by canonical controls; the
incident table does not become a second execution system. Supported bounded
control categories are repository/workspace dispatch pause, Attempt
cancellation and credential revocation, worker/harness/model/tool/Factory
quarantine, Guarded Auto disablement, and publication/release holds.

The qualified `PAUSE_REPOSITORY_DISPATCH` control requires four distinct durable
records: `COMMAND_REQUESTED`, `COMMAND_ISSUED`, `ACKNOWLEDGED`, and
`EFFECT_OBSERVED`. The first records authority without changing state, the
executor alone changes the exact repository projection, and the separately
invoked observer alone records the observed effect. Incident, project,
repository, actor, sequence, expiry, request, predecessor, producer, and runtime
version must match across the lineage. Other unqualified control categories
continue to require distinct canonical PASS evidence envelopes. An
acknowledgment is never containment proof.
Restoration is a later, separate human decision. It requires:

1. the incident has progressed through isolation;
2. the commander first records a durable, expiring, incident-scoped restoration grant;
3. known-safe evidence is attached;
4. each restored control has its own request, command, acknowledgment, and observed-effect lineage;
5. the optimistic incident sequence is still current.

Restoration records the incident authority decision only. It does not recreate,
activate, or otherwise restore an MCP grant, credential, route, worker, or
release authority. Those systems remain authoritative for their own state.

Resolution is allowed only after restoration, correction, prevention, and a
measurement phase with retained evidence.

## Operator workflow

Use **Review & release → Incidents**. The existing navigation target now opens
Incident Command by default and retains ARM operational events as a second tab.
The workspace shows the incident queue, severity, containment/recovery status,
commander, exact lifecycle, advisory agent proposals, next authorized decision,
and the immutable command log.

Loading, empty, unavailable/denied, contained, recovering, monitoring, and
resolved presentations are explicit. Refresh reconstructs the current aggregate
from durable records; stale writes fail and require a fresh inspection.

## Threat drills

The deterministic drill catalog covers prompt/goal injection, secret
exfiltration, tool/MCP poisoning, identity and approval abuse, sandbox or policy
mutation, candidate/evidence substitution, supply-chain compromise,
cross-company leakage, rogue-agent cascades, runaway cost/provider outage,
production regression, and evaluation regression. Each drill maps to OWASP
Agentic Top 10 categories, NIST AI RMF functions, bounded containment, and
existing evidence classes.

Deterministic threat drills do not claim a real production incident occurred.
The retained local non-production pilot `INC-MTQDOIX7-001053` used the canonical
commander identity, changed real repository admission, denied an actual
WorkOrder dispatch with zero runs created, survived backend restart, restored
only after a separate durable grant, and completed the full lifecycle. It is
bounded qualification evidence, not general production authority.

## Rollout and rollback

The incident aggregate is additive and starts at Experimental maturity. Keep
existing alert and runtime controls authoritative. Roll back the UI/API exposure
if authorization, idempotency, currentness, or evidence-link checks regress;
preserve already-created incident records and transitions for audit.

Production promotion still requires exact-main deployment and a bounded
synthetic production acceptance drill. No customer repository or workload may
be used for that qualification.
