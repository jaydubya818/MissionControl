# WorkOrder 1 Preflight — no dispatch authority

Later admission bootstrap: [WorkOrder 1 Admission Report](fdlc-workorder-01-admission-report.md). Exact 0.146.0 was reproduced after this preflight; mutating containment and budget remain blocked. Historical observations below are preserved.

Recommendation: **NO_GO**. Evidence collected 2026-09-05 UTC, separate from
Phase 0 and the earlier preparation rehearsals. The Product Owner accepted
documentation as WO1 only: qualify the path, authorize one bounded run, review
its complete lineage, then expand. The overall ten accepted WorkOrders must
still cover four workload classes. No protocol/validator change is needed.

## Backend diagnosis and recovery

The previously offline endpoint is the **Convex control plane**, not the
`persistent-worker` execution service. Config resolver for the main checkout
identifies instance `local-jaydubya818-missioncontrol_df0fe`, binary version
`precompiled-2026-08-25-7cce8fb`, SQLite/state and storage under
`~/.convex/convex-backend-state/local-jaydubya818-missioncontrol_df0fe`, cloud
port 3214 and site port 3215. All required paths existed. The immediate failure
was an absent listener, not evidence of missing database/dependencies or a
changed endpoint. The reason its previous process stopped is UNKNOWN.

Started that exact existing instance on loopback. No database reset, seed,
code push or execution worker. Initial index-bootstrap errors cleared enough
for `/instance_name`, `projects:list` and `runtimeCompatibility:get` to succeed.
Returned instance matches; deployed contract is 40. Deployment source SHA is
not exposed by this health response and remains UNKNOWN. The service remains
running for readiness inspection; it is not admitted for agent execution.
Normal persisted backend schedules were not reconfigured by this task.

Health contract: identity must match configured instance; scoped queries and
runtime compatibility must succeed. An HTTP listener alone is insufficient.
Startup requires exact existing config/secret, binary, SQLite/storage and free
configured ports. No secret value is copied into evidence. Starting this
control plane neither registers nor starts the execution worker.

## Exact live scope and independent gates

Use the existing configured **Software Factory Research Lab** context for this
qualification, without borrowing canary/demo bindings:

- Tenant: `wx7ajfqrhbjn1rxfz4tc32mekx8b639n`.
- Project: `sn71gskbdemgf4z1trt9zdmm5h8bde69`.
- Repository: `k17wswvrva7ky172eej2w1nj858cbzt7`, jaydubya818/MissionControl.
- Retained definition: `md7t93bxm0f2y6x9c9j7k20ted8ckfge`, DRAFT,
  latestVersion 0, created by a historical demo-labelled administrator.

These are inspected records, not new human membership/ownership authorizations.
No teams, members or team memberships exist in that workspace structure query.
Jarrett's named roles remain recorded; they cannot manufacture those bindings.

| Gate | Status | Observed evidence / exact failure | Required closure |
| --- | --- | --- | --- |
| Configured control plane | QUALIFIED for read access | Original instance and v40 query respond; backend-startup.json | Keep identity/health current; retain source provenance before execution |
| Execution backend | BLOCKED | persistent-worker proposed; no qualified execution profile/worker in scope | Admit exact host/profile without polling or claiming work during qualification |
| Factory Version | BLOCKED | Definition above has versions=[] and assessments=[] | Compose an exact version only from eligible inputs; then retain scoped current receipt, digest, locks and policy |
| Model route | BLOCKED | 11 legacy catalog records; composition modelRoutes=[] | Exact route identity/digest and compatible risk/workload/harness/runtime qualification; catalog model ID/HEALTHY/estimate is insufficient |
| Host | BLOCKED | workspaceHostBindings:listByProject returns [] | Exact host/session/backend binding, repository scope, dependencies, leases, cleanup and current health proof |
| Runtime artifact | BLOCKED | Installed codex-cli 0.153.3 native SHA256 0e1f892695844ad0798dab8895955846450a9e7663476ebf24615814dd377216 differs from proposed 0.146.0 / ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02 | Explicit compatible artifact installation or separately qualified runtime selection; do not rewrite the frozen identity |
| Independent verifier | BLOCKED | context/verifiers:list returns []; no verification Factory version in selected scope | Separate verifier identity/configuration/host; exact subject and candidate-negative controls on admitted tuple |
| Budget | BLOCKED | No version/route/Plan/WO to bind reservation; current codex/v1 rejects exact maxTokens configuration | Supported enforceable token policy plus exact recorded monetary/time/Attempt limits and reservation evidence; no cap waiver |
| Credentials/host containment | BLOCKED | No admitted host/code scope; inherited HOME/CODEX_HOME and runtime mismatch prevent claiming unrelated files/credentials unavailable | Scoped credentials, environment, filesystem/network and subprocess probe on exact admitted runtime; cleanup proof and revocation path |

Source inspection of `codexChildEnvironment` shows an environment allowlist
excluding arbitrary secret variables, but it passes HOME/CODEX_HOME, PATH and
temporary-directory configuration. This does not prove filesystem credential
isolation. The strict repository-only profile is read-only planning configuration;
it cannot be treated as proven containment for mutating documentation execution.
No unrelated secrets were read, copied or exposed to a child during this audit.
Do not start an uncontained worker or use a different runtime to obtain a green
probe. Sensitive-repository/provider-egress rules remain unchanged. The live
repository record has no explicit classification and reports webhook MISSING.

Budget proposal remains $2 total for WO1 ($1 producer/$1 verifier), 15 minutes
each, one producer Attempt and one verifier Attempt, zero automatic retries,
one slot; these are not approved reservations. Exact token cap is unresolved
because current adapter validation rejects maxTokens rather than pretending to
apply it. Source cost policy requires full approved-WorkOrder-cap reservation,
positive estimate and evidence, with actual telemetry MEASURED or explicitly
UNAVAILABLE. Legacy estimatedCostPerRunUsd is neither that authority nor actual
provider billing. Actual unknown components remain UNKNOWN, never zero.

## Final bound-item preview

| Item | Status | Proposed identity / evidence |
| --- | --- | --- |
| Repository | BLOCKED for execution | Source repository and original SHA 9a80cf3c5cc229bb4a552a9f08ddda5841e70a38 known; scope/classification and final approved base unresolved |
| Workload | QUALIFIED as approved design only | One link correction in docs/guides/RUN.md, frozen byte/hash contract in earlier preparation evidence; actual file unchanged |
| Plan revision | BLOCKED | No approved exact real Plan |
| WorkOrder revision | BLOCKED | No authorized real WorkOrder/Task; none seeded for testing |
| Factory Version/digest | BLOCKED | No version exists in selected definition |
| Model route/digest | BLOCKED | Zero admissible routes returned |
| Harness | BLOCKED for admission | Source candidate codex/v1, codex-cli 0.146.0, manifest sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06; no live tuple |
| Runtime | BLOCKED | Observed installed binary mismatch above |
| Backend | QUALIFIED control-plane health / BLOCKED execution | Original Convex 3214 is up; persistent-worker not admitted |
| Host | BLOCKED | No scoped host binding |
| Verifier | BLOCKED | No separate registered verifier/qualified runtime/host |
| Budget | BLOCKED | Proposed limits not frozen or reserved; exact token enforcement absent |
| Containment | BLOCKED | No exact admitted credential/filesystem/network boundary proof |
| Policy | BLOCKED | No current Factory policy lock/receipt/classification |
| Acceptance | QUALIFIED as contract only | Exact one allowed file/replacement/hash/target/anchor, required test/lint/build/security checks and independent exact-candidate evidence; see execution proposal |
| Rollback | QUALIFIED as procedure only | Cancel/fence before effects; reconcile pending publication; human close of unmerged PR or separately authorized reviewed revert after merge; no live drill claim |
| Incident authority | QUALIFIED named roles / BLOCKED live mapping | Jarrett West; actual host/credential stop/quarantine/revoke/restoration bindings absent |
| Readiness expiration | BLOCKED / NOT ISSUED | No actual Plan/WO subject or qualified tuple exists; cannot issue a current readiness receipt |

This table is an evidence-backed preflight, not the `workOrders:readiness`
response. Its actual query cannot be evaluated without an authorized real
WorkOrder ID; calling with a fake ID would provide no proof. No readiness status
was manually changed. Once every prerequisite and subject exists, query with
exact WorkOrder revision and Factory ID, capture all bound identities and
recompute on any change; UI snapshots expire after 30 seconds. Do not represent
this static report as an unexpired dispatch snapshot.

## Rehearsal validity and next safe actions

Earlier separate implementation/verifier dependency worktrees and local fake
process cancellation/fencing evidence remain preserved at their original
revision/configuration. They were not rerun to obtain duplicate green results.
The now-observed 0.153.3 executable is not the proposed pinned runtime; those
rehearsals do not qualify it. If a runtime/host is changed and admitted, rerun
only affected containment, process-group termination, lease/currentness,
workspace preparation/cleanup and exact-candidate verifier controls. Wrong
candidate, commit, worktree and stale candidate must reject on that tuple;
prior deterministic negative tests are not a substitute for live verifier
qualification.

Next closure sequence: identify a compatible admitted artifact and exact route
(including token/cost authority); create proper human/scope/policy bindings;
qualify host and separate verifier without dispatch; compose/assess Factory;
obtain exact governed Plan/WorkOrder decisions; regenerate readiness; return
for human GO. Do not silently switch profile, approve identities, ignore token
limits or use canary/demo fixtures. Missing route/containment are hard blockers,
so no further execution can truthfully qualify this proposal today.

No new application/Phase 2 code, backend substitution, pilot model call,
WorkOrder execution, pilot PR, merge, release or deployment was performed.
Phase 0 review commit remains separate and unchanged.
