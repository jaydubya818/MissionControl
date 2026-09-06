---
status: ready
priority: p1
issue_id: "072"
tags: [software-factory, incidents, security, dispatch, production]
dependencies: []
---

# Qualify real repository-dispatch incident actuation

## Problem Statement

Incident Command v51 can validate canonical control evidence but cannot perform
or independently observe a real bounded control. The named pilot therefore
fails closed before containment and Production promotion is correctly blocked.

## Findings

- `factory/incidents:advance` correctly rejects missing, stale, forged, and
  acknowledgment-only evidence.
- `workOrders:dispatch` is the canonical shared admission path for human and
  service dispatch.
- No durable repository-scoped dispatch pause projection or canonical control
  executor exists on runtime v52.

## Proposed Solutions

### Option 1: Repository-scoped projection plus bounded executor and observer

**Pros:** real effect, restart-safe, one dispatch gate, independent observation.

**Cons:** adds three tables and five narrow public operations.

**Effort:** High

**Risk:** Medium

### Option 2: Reuse feature flags

**Pros:** fewer schema changes.

**Cons:** no exact repository scope, weak receipt lineage, and ambiguous meaning.

**Effort:** Medium

**Risk:** High

### Option 3: External arbitrary-command executor

**Pros:** broad future flexibility.

**Cons:** excessive authority and directly outside the approved scope.

**Effort:** High

**Risk:** Critical

## Recommended Action

Implement Option 1 at runtime contract v53. Keep executor, observer, and Incident
Command responsibilities explicit and independently attributable.

## Technical Details

- `convex/factory/incidentControls.ts`
- `convex/factory/incidentControlObserver.ts`
- `convex/factory/incidents.ts`
- `convex/workOrders.ts`
- `convex/schema.ts`
- Incident Command UI and focused tests

## Acceptance Criteria

- [x] Runtime contract advances from v52 to v53 with an exact public diff.
- [x] PAUSE changes only the exact repository's durable dispatch admission.
- [x] Request, command, acknowledgment, and observed effect are distinct durable records.
- [x] The observer, not the executor, emits effect evidence.
- [x] New dispatch fails closed while paused; unrelated repositories are unaffected.
- [x] Pause state survives backend restart and the resolved receipt chains survive browser refresh.
- [x] RESUME requires separate durable current restoration authority and restores admission.
- [x] Wrong scope, stale authority, forged effect, wrong observer, and replay fail closed in focused controls.
- [x] Named non-production pilot browser proof passes with persisted records.
- [x] Architecture, security, data integrity, simplicity, and documentation reviews are GO.
- [ ] CI, merge, exact-main qualification, and governed Production acceptance pass.
- [ ] README and retained evidence state only what was actually proven.

## Work Log

### 2026-09-06 - Authorized implementation start

**By:** Repository operator through Codex

**Actions:**
- Reconciled against current main `e0b15142a33987983526b87c2144208e40e98657`.
- Confirmed runtime v52 is occupied and selected v53.
- Chose the approved narrow repository-scoped projection/executor/observer design.

**Learnings:**
- The existing evidence gate is correct and must remain strict; the missing
  capability is real actuation plus independent observation, not looser evidence.

### 2026-09-06 - Strict local pilot completed

**By:** `demo:company-administrator` under Product Owner authorization

**Actions:**
- Resolved `INC-MTQDOIX7-001053` through all nine lifecycle sequences.
- Retained distinct request, command, ACK, and observer receipts for pause and resume.
- Proved a real WorkOrder dispatch failed with `repository-dispatch-paused` and created zero runs.
- Restarted the backend and proved the denied projection and receipt chain persisted.
- Recorded restoration authority before resume; independently observed ENABLED afterward.
- Proved the restored request passed incident admission and reached the separate scope gate.

**Learnings:**
- Restored repository admission does not bypass ordinary team/owner/host scope policy.
- Company-admin or an explicit `factory.incident.control` role is required; generic delivery
  approval and factory read permission are insufficient.

### 2026-09-06 - Independent review closure

**Actions:**
- Architecture: GO.
- Security: GO; no remaining P0-P3 findings.
- Data integrity/documentation: GO; no remaining P0-P2 findings.
- Simplicity: GO; the separate authority/executor/observer boundaries are
  safety-significant rather than accidental abstraction.
- Implementation sealed at `8ca572cd9403f3c95b04e5fcc9dce01e655d51b9`.
