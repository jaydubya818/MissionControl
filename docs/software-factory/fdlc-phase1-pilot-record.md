# Phase 1 pilot — current identity and admission record

Updated 2026-09-05 UTC from the Product Owner's explicit pilot-preparation request.

- Owning team: **FDLC / Mission Control**.
- Champion: **Jarrett West**.
- Human FDE/operator: **Jarrett West**.
- Incident Commander: **Jarrett West**.

One person intentionally holds these roles. Independent technical verification
still requires the existing separately configured verifier; human acceptance
is a distinct control. These identities do not approve any Plan, WorkOrder,
Factory/route/harness/runtime/backend tuple, budget, PR, merge, release or
rollback. This assignment does not waive or combine Plan approval, WorkOrder
authorization, independent verification, acceptance, publication, merge,
release, containment, cost, security or rollback gates. It authorizes
preparation only until explicit human GO.

Current recommendation: **NO_GO**, due to unavailable live configuration,
missing exact Plan/WorkOrder approval, budget and containment evidence, and an
installed-runtime mismatch. The four-class cohort decision is now resolved:
documentation WO1 first, overall four-class requirement unchanged. The identity blocker is resolved.
Accepted real WorkOrders remain 0/10; no real model call or pilot execution.

Latest qualification: the original control-plane backend is reachable; retained
Factory has zero versions, with zero admissible routes, hosts and verifiers in
the intended Research Lab scope. Installed Codex 0.153.3 differs from proposed
0.146.0. See [WorkOrder 1 Preflight](fdlc-workorder-01-preflight.md).

The exact proposal, ten evidence-based candidate changes, baseline, independent
verification contract, budget recommendations, incident actions and all current
blockers are in [Pilot Execution Proposal](fdlc-phase1-execution-proposal.md).
New rehearsal evidence lives in `docs/testing/evidence/fdlc-phase1-preexecution-2026-09-05/`.
Phase 0 source/review evidence remains separate. No Phase 2 implementation or
todo dependency change is authorized.

## Retained preparation record — 2026-09-04, superseded above

The following preserves the earlier unknown-identity/pre-drill baseline. Its
NOT RUN statements describe that earlier preparation state, not today's local
rehearsals. Historical execution failures are unchanged.

### Original admission record

Status: **BLOCKED. NO-GO to start the real pilot.**
Source baseline: `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38` plus the uncommitted
Phase 0 readiness changes. No real pilot Attempt, PR, acceptance or release has
been created by this task. The isolated demo used for browser verification is
not a pilot and does not count toward the ten-outcome gate.

## Selection and baseline

Required named identities were requested from the Product Owner and remain
UNKNOWN: owning team, champion, human FDE/operator, incident commander. Do not
infer them from seed data, Git authorship or the assistant's role.

Candidate repository: `jaydubya818/MissionControl`. Final selection remains
pending the named owners and a reviewed bounded backlog; no other repository
is presumed authorized by its presence on this machine.

| Workflow candidate | Benefit and suitability | Limitation / decision |
| --- | --- | --- |
| Documentation maintenance | Repetitive, reversible, small diff; current repository has a docs consistency gate and evidence/source separation requirements. | Preferred starting class if a real user-facing defect and independent acceptance check are identified. Do not manufacture ten cosmetic changes. |
| Dependency modernization | Repeated engineering value, lockfile and test verification. | Larger dependency and supply-chain blast radius; not first choice without a pinned dependency problem and baseline. |
| Test repair | Objective failing/passing comparison and bounded patches. | Verifier must prevent weakening assertions or simply accepting the producer's tests. Choose only a reproduced real defect. |
| Mechanical API migration / framework upgrade | Repeatable transformation and measurable migration progress. | No identified bounded target in the reviewed backlog; broader scope than required. |

This is a justified candidate comparison, not a silently selected final target.
Engineering objective: prove one real intent-to-observed-outcome line, then the
existing ten accepted WorkOrder threshold within the authorized protocol.

Baseline cycle time: UNKNOWN. Baseline human effort: UNKNOWN. Baseline
rework/defects: UNKNOWN. Collect prior comparable changes with timestamps,
review/intervention minutes and defect records; record sample size and missing
coverage. Do not substitute synthetic runtime for baseline human effort.

Exclusions: credentials/auth changes, money movement, production data changes,
remote egress expansion, broad dependencies, policy weakening and Phase 2+.
Acceptance for a chosen documentation repair: reproduce a concrete incorrect
instruction/reference at pinned base; freeze exact files and expected corrected
behavior in the Plan; independently verify source correspondence and repository
docs checks; require human review. Rollback: revert the accepted bounded commit
through the existing authorized PR path. No autonomous rollback is authorized.

## Incident operating contract — draft, drill NOT RUN

The named incident commander is required before execution. Record an explicit
operator who can pause/stop admission and cancel the exact Attempt. Use existing
controls and retain their audit records; a UI button is not proof of revocation.
Credential owner must demonstrate revocation using the existing credential
provider and confirm the worker cannot reuse the revoked authority. Quarantine
must disable the affected host/binding and isolate its worktree without deleting
evidence. Rollback uses the repository's reviewed revert path. Escalation goes
to the named commander and champion; their contact path remains UNKNOWN.

Bounded preflight drill: on an isolated authorized test Attempt, record exact
lease/host/configuration, issue cancellation, verify the worker stops and stale
completion is rejected, revoke its test credential, attempt reuse and capture
denial, quarantine the binding, verify new admission is denied, then document
cleanup/recovery and who authorized restoration. Retain action summaries,
evidence deltas, failure classes, next hypotheses and control decisions. Never
persist private chain-of-thought. This drill is a prerequisite; it is NOT RUN.

## Lineage and qualification record

All real identifiers below remain NOT CREATED: Mission, Mission Spec revision,
researched governed Plan revision, human exact-Plan approval, WorkOrder, Task,
Attempt, frozen Factory Version, tuple qualification receipt, candidate SHA,
independent verifier subject, evidence, review package, authorized PR, human
acceptance, release and observed outcome. No substitute state machine or direct
seeded Plan can fulfill this sequence.

If an Attempt fails, preserve its immutable environment/configuration and
failure evidence. Record a changed hypothesis and obtain separate corrective
Attempt authorization. Historical 2026-08-30 failure remains unchanged and is
not the first Attempt of this new pilot.

Required loop cases remain pilot NOT RUN: changed-hypothesis retry; identical
failure detection; oscillation/no-progress; budget exhaustion; lease expiry;
worker restart; provider outage; cancellation; stale evidence; PR-head drift;
revocation; cleanup failure. Deterministic regression tests are separate scoped
evidence, not proof these cases occurred in this real pilot. Session resume and
durable workflow recovery must be reported separately.

## Ten-outcome and economics records

Accepted real WorkOrders: **0 / 10**. The denominator is an operational pilot
threshold, not a reliability estimate. For each eventual outcome retain workload
classification, exact tuple/Plan/WorkOrder revisions, elapsed time, human review
minutes and interventions, retries, independent verification, cost coverage,
acceptance/outcome and defects/rework. No invented rows or fixture acceptances.

| Cost component | Classification now | Required source |
| --- | --- | --- |
| Model/provider tokens | UNKNOWN | Attempt provider usage receipt |
| Actual provider charge | UNKNOWN | Provider billing or explicit authoritative price calculation, classified appropriately |
| Compute/runtime, tools, CI | UNKNOWN | Attributable usage/billing records |
| Retry / failed Attempt cost | UNKNOWN | Separate immutable Attempt records |
| Human review minutes / interventions | UNKNOWN | Named human timing and intervention log |

MEASURED values require attribution; ESTIMATED values require method/assumptions;
UNKNOWN values remain missing. No Cost per Verified Software Outcome is claimed:
there are no accepted pilot outcomes and the cost numerator is incomplete.

## Evals and next decision

Use existing Eval Control Plane; freeze suite/version/digest, source revision,
Factory and all four tuple identities before running. Preserve INVALID and SKIP
and complete-case accounting; execute negative controls. Pilot eval receipt:
NOT CREATED. Local regression eval receipts are referenced in the Phase 0
qualification directory and convey no dispatch/acceptance/merge/release rights.

Decision: **NO-GO to start**, due to missing named owners and incident preflight,
not an inferred failure of the unrun pilot. Next authorized slice is finishing
todo 059 admission and one real lineage after owners are supplied. There is no
measured pilot basis for selecting a Phase 2 feature yet. Preserve 059→060→061
and all existing downstream dependencies; any proposed early prerequisite needs
an explicit sequencing decision. Stop after Phase 1; no automatic Phase 2 work.

## Admission bootstrap — 2026-09-05

[WorkOrder 1 Admission Report](fdlc-workorder-01-admission-report.md) records exact
0.146.0 reproduction and startup, partial read-only containment evidence, and
remaining mutation containment/budget blockers. Recommendation remains NO_GO.
No Factory, host, route, verifier or readiness receipt was fabricated; WO1 remains
unexecuted. Named FDLC / Mission Control and Jarrett West roles remain unchanged.

## Admission closure — 2026-09-05

See [WorkOrder 1 Admission Closure Report](fdlc-workorder-01-admission-closure-report.md).
Three no-model candidate mutation matrices exposed unauthorized global-temp and
runtime writable-open authority; no runtime bytes changed. The hard-token request
is rejected before process start. Both hard gates remain blocked; dependent
authority and readiness remain unissued. WO1 was not executed.

## Final blocker decision — 2026-09-05

[Final Admission Report](fdlc-workorder-01-final-admission-report.md) retains
BLOCKED_CONTAINMENT and requests an explicit budget-policy decision. An outer OS
write allowlist allows native startup in a diagnostic configuration but the nested
Codex sandbox fails before tool execution. Original budget instructions specify
token limits without separate input/output semantics or numeric caps; no global
Factory token gate or approved equivalence was found. No gate was weakened.

## Execution-path decision — 2026-09-05

Human decision: retain hard provider liability control; the resource-only alternative
is not approved. [Execution Path Qualification Report](fdlc-phase1-execution-path-qualification-report.md)
compares available backends/providers and recommends exactly one Docker-backed Factory
provider candidate. Existing doctor canary passed, but no integrated qualified worker
path exists. Disposition BLOCKED_EXECUTION_ENVIRONMENT; hard budget independently
unqualified. Original reports/evidence remain unchanged. No dependent authority or WO1 execution.

### 2026-09-05 — Docker execution closure implementation

Latest disposition: **NO_GO**; WO1 remains undispatched and readiness NOT_ISSUED.
Owning team FDLC / Mission Control; Champion, Human FDE / Operator and Incident
Commander Jarrett West. No role or gate consolidation.

Internal Docker provider now uses the existing worker/sandbox lifecycle for an
immutable, no-network, credential-free qualification probe. Actual fixture worker
result, cancellation, restart cleanup and budget negative controls pass. No
production provider route, authoritative reservation, full execution tuple or
producing-runtime qualification is issued. Default runtime-contract guard also
finds unrelated upstream v41 versus current v40; explicit starting-SHA guard
finds no public API change. Prior reports are preserved.

Current report: [Docker execution path qualification](fdlc-phase1-docker-execution-path-qualification-report.md).
