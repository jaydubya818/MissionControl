# Canonical software factory lifecycle

Status: normative design for Mission Control hardening
Applies to: new factory executions after the Relay qualification incident

## Purpose

Mission Control must represent execution truth without collapsing distinct facts. A process can finish without producing a valid candidate. A candidate can exist without being verified. A verifier can complete with a negative or blocked verdict. A verified candidate is not accepted until its governed acceptance action completes. A predecessor does not unlock accepted-output dependencies before that point.

The authoritative hierarchy is:

```text
Objective
  └─ Plan revision
       └─ Factory Run membership
            └─ WorkOrder revision
                 ├─ Task
                 │    └─ Attempt
                 ├─ immutable Candidate
                 ├─ Verification Attempt
                 │    └─ immutable Evidence + Verdict
                 └─ Acceptance
```

## Entities and ownership

| Entity | Meaning | Mutable fields | Immutable facts |
|---|---|---|---|
| Factory Run | One bounded execution of an approved plan revision. | Operational mode and derived progress. | Run identity, plan revision, membership snapshot, creation provenance. |
| WorkOrder revision | Approved implementation contract and dependency node. | None after approval; a change creates a new revision. | Scope, criteria, checks, budgets, dependencies, approval binding. |
| Task | Operator-facing unit within one WorkOrder revision. | Current projection and assignment according to governance. | Task identity and owning WorkOrder lineage. |
| Attempt | One bounded invocation or non-executing continuation. | Lease/checkpoint fields only while current authority is valid; one terminal transition. | Identity, purpose, input, revision/contract binding, terminal record. |
| Producer | The implementation Attempt that created a candidate. | Nothing after terminal candidate capture. | Invocation, lease provenance, runtime/model/factory versions. |
| Candidate | Exact output proposed for verification. | Never. | Base revision, candidate revision, tree, branch, repository, producer, contract. |
| Verification Attempt | Independent evaluation invocation of one candidate. | Lease/checkpoints while active; one terminal execution status. | Candidate subject, producer provenance, verifier invocation/lease, contract. |
| Evidence | Result emitted by a check. | Never; supersession only changes applicability in a separate record. | Content, hash, producer, check, subject, timestamps. |
| Acceptance | Governed decision that a verified current candidate satisfies the WorkOrder. | Never; later revisions supersede applicability. | Actor/policy, candidate, verification receipt, WorkOrder revision, decision. |
| Lease | Time-bounded active authority for one Attempt and purpose. | Heartbeat/expiry while valid. | Lease identity and issuance history. |
| Continuation | New identity that resumes a permitted operation without rewriting history. | According to its own purpose and lease. | Parent lineage and frozen subject. |

## Four independent status dimensions

No single field may stand in for all four dimensions.

| Dimension | Examples | Answers |
|---|---|---|
| Execution | QUEUED, RUNNING, STALE, COMPLETED, FAILED, CANCELLED | Did the invocation run and terminate? |
| Verification verdict | VERIFIED, NOT_VERIFIED, BLOCKED, NOT_EVALUATED | What did independent evaluation establish? |
| Gate/acceptance | INELIGIBLE, ELIGIBLE, ACCEPTED, REJECTED, SUPERSEDED | May this exact candidate advance? |
| Terminal class | ACCEPTED_SUCCESS, PRODUCT_FAILURE, VERIFICATION_FAILURE, FACTORY_FAILURE, BLOCKED, CANCELLED, SUPERSEDED | Who owns the terminal outcome and what action is valid? |

## Factory Run lifecycle

```text
DRAFT → APPROVED → READY → RUNNING ─┬→ DRAINING → TERMINAL
                                    ├→ PAUSED ───→ RUNNING
                                    ├→ STOPPING ─→ TERMINAL
                                    └→ CANCELLED
```

- Membership is frozen explicitly as `(factoryRunId, workOrderId, revisionNumber)` rows or an equivalent immutable snapshot.
- Project or mission membership is never a substitute for Factory Run membership.
- `PAUSED` blocks new claims while existing attempts continue.
- `DRAINING` blocks new claims, permits existing attempts to reach a bounded terminal state, reconciles leases, then exits workers.
- `STOPPING` blocks new claims and interrupts active work according to the configured safe-stop policy.
- `CANCELLED` is an audited operator decision, not a generic worker failure.
- A run is terminal only when every member is accepted, failed, blocked, cancelled, or superseded and no live lease remains.

## WorkOrder lifecycle

The canonical states are:

```text
PLANNED → APPROVED → READY → DISPATCHED → EXECUTING → CANDIDATE → VERIFYING
                                                                    │
                      ┌─────────────────────────────────────────────┤
                      │                                             │
                      ▼                                             ▼
              NOT_VERIFIED / BLOCKED                         VERIFIED
                      │                                             │
          retry verifier, revise, or new producer                   ▼
                                                               ACCEPTANCE
                                                                    │
                                                           ACCEPTED / REJECTED
```

`FAILED`, `CANCELLED`, and `SUPERSEDED` are terminal for the exact WorkOrder revision. `BLOCKED` is terminal for an Attempt but may be recoverable for the WorkOrder through a new governed action. Existing storage enums may project these canonical states, but projection must not erase them.

Allowed advancement rules:

1. `APPROVED` requires approval bound to the exact immutable revision.
2. `READY` requires satisfied dependencies, admission, scope, authority, host, and contract checks.
3. `EXECUTING` requires a live implementation Attempt lease.
4. `CANDIDATE` requires an immutable subject captured from a terminal producer Attempt.
5. `VERIFYING` requires a separate Verification Attempt and authority.
6. `VERIFIED` requires all mandatory evaluable checks to pass with qualifying evidence and no blocking policy finding.
7. `ACCEPTED` requires a governed acceptance bound to the same WorkOrder revision, candidate, subject digest, contract digest, and verification receipt.
8. Accepted-output dependencies are satisfied only by `ACCEPTED`, never by process completion, candidate presence, or verifier completion.

## Attempt lifecycle and runtime truth

```text
QUEUED → CLAIMED → RUNNING → FINALIZING → COMPLETED_SUCCESS
                    │          │        ├→ COMPLETED_FAILURE
                    │          │        ├→ BLOCKED
                    │          │        └→ CANCELLED
                    │          └→ STALE → RECONCILING → terminal/new Attempt
                    └→ claim expiry → RETRYABLE_INFRA
```

A canonical RUNNING projection is derived from both stored state and runtime ownership:

| Stored status | Lease/heartbeat/process observation | User-facing truth |
|---|---|---|
| RUNNING | current lease, healthy heartbeat, live owned process | RUNNING |
| RUNNING | current lease, heartbeat delayed within grace | RUNNING / DEGRADED |
| RUNNING | expired lease | STALE / EXPIRED_LEASE |
| RUNNING | worker session missing or process known terminated | STALE / MISSING_EXECUTOR |
| RUNNING | ownership cannot be proven | STALE / OWNERSHIP_UNKNOWN |

Reconciliation is idempotent. It does not rewrite the old Attempt as though it never ran. It records the terminal disposition and, if policy permits, creates a new Attempt identity.

The finalization invariant is:

```text
owned process terminal
        ↓
persist final output/evidence or explicit loss reason
        ↓
Attempt terminal exactly once
        ↓
Task projection reconciled
        ↓
WorkOrder projection reconciled
        ↓
Factory Run aggregate reconciled
```

## Candidate and evidence immutability

Candidate identity is the tuple:

```text
repository + base revision + candidate revision + tree + branch
+ WorkOrder revision + contract digest + producer Attempt
```

After capture, no tuple member may change. Evidence is append-only and bound to the subject it evaluated. A later receipt may mark older evidence stale for current advancement, but must not alter or delete it.

Every recovery mutation performs a compare-and-swap against:

```text
expected WorkOrder revision/generation
expected contract digest
expected current producer Attempt
expected candidate subject digest
expected latest applicable verification receipt
expected active authority, when mutation is requested
```

Any mismatch fails closed without partial writes.

## Authority and provenance

```text
PROVENANCE REFERENCE                         ACTIVE AUTHORITY
historical fact                             expiring capability
may outlive run                             valid only now
readable by lineage checks                  permits bounded mutation/heartbeat
never grants execution                      bound to Attempt + purpose + worker session
```

A historical lease identifier may be copied into provenance. It can never authorize a heartbeat, mutation, finalization, publication, or retry. Active authority requires the current canonical lease, unexpired time, matching worker identity/session/generation, matching Attempt purpose, and matching subject/contract where applicable.

Producer/verifier independence compares the original producer invocation and active historical lease provenance against the verifier's distinct invocation and lease. A continuation must resolve through its parent chain to the original producer; it must not manufacture independence by hiding the producer.

## Verification lifecycle

```text
ADMISSION
  ├─ package manager/version
  ├─ lockfile integrity
  ├─ offline cache completeness
  ├─ verifier authority/independence
  └─ subject immutability
        │
        ├─ blocked → terminal verdict BLOCKED / checks NOT_EVALUATED
        ▼
CHECK DAG
  prerequisite check ──pass──→ dependent check
          │
          └─fail/error────────→ dependent BLOCKED_BY_DEPENDENCY
```

Canonical check outcomes:

- `PASS`: check executed and satisfied its assertion.
- `FAIL`: check executed against the candidate and disproved its assertion.
- `ERROR`: verifier infrastructure failed while executing the check.
- `TIMED_OUT`: bounded execution expired and the owned process tree was terminated.
- `BLOCKED_BY_DEPENDENCY`: check did not run because a declared prerequisite failed.
- `NOT_EVALUATED`: check did not run because the environment, authority, or subject could not be admitted.
- `SKIPPED`: contract explicitly permits the check to be skipped for this subject.
- `NOT_CONFIGURED`: no admitted verifier exists; this is never equivalent to PASS.

Each non-PASS result records a machine reason code, ownership class, causal check IDs, and human summary.

Verdict rules:

| Condition | Verdict | Terminal ownership |
|---|---|---|
| All mandatory checks pass and coverage is evidenced | VERIFIED | none until acceptance |
| A candidate-bearing check runs and disproves a mandatory assertion | NOT_VERIFIED | PRODUCT_FAILURE or VERIFICATION_FAILURE according to check type |
| Admission/authority/policy prevents safe evaluation | BLOCKED | BLOCKED or CONTRACT_FAILURE |
| Environment/infrastructure prevents evaluation | NOT_EVALUATED | VERIFICATION_ENVIRONMENT_FAILURE or FACTORY_FAILURE |
| Human judgment is contractually required after automated success | REQUIRES_HUMAN_REVIEW | pending acceptance |

Requirements are **disproven** only by qualifying executed evidence. `BLOCKED_BY_DEPENDENCY`, `NOT_EVALUATED`, `ERROR`, and `TIMED_OUT` mean the requirement remains unproven, not failed.

## Retry and continuation matrix

| Prior result | Default governed action | Candidate mutation? | New identity? | Human action? |
|---|---|---:|---:|---:|
| Verifier crash before evaluation | New Verification Attempt | No | Yes | Policy-dependent |
| Verifier timeout | New Verification Attempt only after cause/remediation is recorded | No | Yes | Usually review |
| Factory/environment failure | Repair factory/admission, then exact-candidate Verification Attempt | No | Yes | Required when policy says so |
| BLOCKED by authority/contract | Correct authority or revise contract; never bypass | No, unless a new producer revision is authorized | Yes | Yes |
| NOT_VERIFIED with candidate failure | New producer revision by default | Yes, under new producer Attempt | Yes | Review/revise |
| NOT_VERIFIED with retryable nondeterministic check | Exact-candidate Verification Attempt if contract permits | No | Yes | Audited reason |
| VERIFIED | Acceptance; no verifier retry for advancement | No | Acceptance identity | According to policy |
| Superseded subject/revision | No retry; create work against current revision | N/A | Yes | Yes |

A read-only verification continuation is allowed only when the exact candidate and all current bindings still match. It creates a new continuation identity and a new verifier Attempt. It invokes no producer and grants no mutation authority.

## Timeout and subprocess contract

Every executable check owns a process group. On timeout or stop it must:

1. send graceful termination to the group;
2. wait only the configured grace period;
3. force-terminate remaining descendants;
4. capture bounded stdout/stderr and termination metadata;
5. persist `TIMED_OUT` or `CANCELLED` before releasing the lease;
6. reconcile Attempt, Task, WorkOrder, and Factory Run state.

Inactivity timeout and absolute timeout are separate policies. Dependency admission should establish impossibility before execution; a long absolute timeout is not a substitute for preflight.

## Downstream dispatch

Dependencies are typed. At minimum:

- `ACCEPTED_OUTPUT`: requires the exact predecessor revision to be ACCEPTED.
- `VERIFIED_EVIDENCE`: requires a current VERIFIED receipt but not acceptance, only when explicitly allowed by plan policy.
- `ORDER_ONLY`: requires terminal completion of the predecessor action and conveys no product validity.

The safe default is `ACCEPTED_OUTPUT`. A new predecessor revision invalidates satisfaction until that revision is accepted. Dispatch uses the Factory Run membership snapshot and never scans unrelated project WorkOrders.

## Terminal outcome classifier

The classifier is a pure, idempotent projection over immutable receipts and current canonical bindings:

| Terminal class | Meaning |
|---|---|
| ACCEPTED_SUCCESS | Current candidate was verified and accepted for the exact WorkOrder revision. |
| PRODUCT_FAILURE | Candidate-bearing evidence disproved a required product assertion. |
| VERIFICATION_FAILURE | The verifier ran but its own check/evaluator failed independently of product behavior. |
| FACTORY_FAILURE | Mission Control executor, worker, lease, persistence, or orchestration failed. |
| VERIFICATION_ENVIRONMENT_FAILURE | Required deterministic evaluation environment could not be established. |
| CONTRACT_FAILURE | The approved contract was internally inconsistent or had no admissible verifier. |
| BLOCKED | Governance, authority, dependency, or policy prevents advancement and requires a named action. |
| CANCELLED | An authorized operator or policy explicitly cancelled execution. |
| SUPERSEDED | A newer immutable revision or candidate replaced this subject for current advancement. |

Terminal does not mean successful, and `COMPLETED` is not a terminal class. Every class carries a reason code, causal entity IDs, remediation, and the actor or subsystem responsible for the classification.

## Required operator projections

A WorkOrder summary must join, without forcing the operator to reconstruct it:

- ID, title, current exact revision and lifecycle state;
- accepted/total, active, failed, and blocked Tasks;
- current Attempt execution truth and lease health;
- current gate, immutable candidate, latest verdict, and acceptance eligibility;
- primary blocking reason and next governed action;
- dependencies and downstream dependents.

A Factory Run summary must be membership-scoped and show total, accepted, ready, executing, verifying, blocked, failed, remaining, current critical path, active WorkOrders, blocking gate, latest verdict, and dispatch frontier.

Historical Attempts and evidence remain reachable and comparable, but never outrank the current revision/subject in the primary action hierarchy.
