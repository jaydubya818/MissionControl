# FDLC Phase 1 — WorkOrder 1 Admission Closure Report

Disposition: **NO_GO**. Observed 2026-09-05 UTC. This report supersedes the
[admission bootstrap report](fdlc-workorder-01-admission-report.md) for closure status.
No WorkOrder readiness snapshot, registration or execution authority was issued.

## Remaining blocking gates

1. **Mutating containment / runtime resource protection:** the exact pinned
   executable's direct sandbox probes permitted writes outside the admitted temp
   area and writable opens of its own package resources. All three tested
   permission configurations failed these boundaries. The producing worker also
   lacks the required integrated qualified boundary. See M1–M3 below.
2. **Enforceable pilot budget:** the selected adapter rejects hard token caps;
   internal provider requests/retries are unbounded by the exposed controls.
   No valid reservation or policy equivalence closes the pilot's hard token
   requirement. See B and T below.
3. **Dependent qualification and governed subjects:** host, verifier, exact
   route, Factory Version/receipt, approved Plan/authorized WO and readiness
   remain unissued. The user's dependency rule prohibits creating them before
   containment and budget qualify. They are not waived by this report.

## Scope and evidence

FDLC / Mission Control owns the pilot. Jarrett West remains Champion, Human
FDE / Operator and Incident Commander. This intentional role overlap does not
combine any Plan, WorkOrder, verification, acceptance, publication, merge,
release, containment, cost, security or rollback gate. WO1 remains the original
single-link correction; no pilot content was changed.

Evidence directory: `docs/testing/evidence/fdlc-phase1-admission-closure-2026-09-05/`.

- **M1**: [mutation-matrix-v1.json](../testing/evidence/fdlc-phase1-admission-closure-2026-09-05/mutation-matrix-v1.json), first allowlisted mutation profile and actual command outputs.
- **M2**: [mutation-matrix-v2.json](../testing/evidence/fdlc-phase1-admission-closure-2026-09-05/mutation-matrix-v2.json), explicit root-default denial/removal of global temporary grant; failures retained.
- **M3**: [mutation-matrix.json](../testing/evidence/fdlc-phase1-admission-closure-2026-09-05/mutation-matrix.json), additionally tests the runtime's legacy temporary-root exclusion switches.
- **C**: [cleanup-runtime.json](../testing/evidence/fdlc-phase1-admission-closure-2026-09-05/cleanup-runtime.json), all seven package hashes unchanged, fixture cleanup, process check and original control-plane identity.
- **T**: [budget-verification.md](../testing/evidence/fdlc-phase1-admission-closure-2026-09-05/budget-verification.md), commands, results and precise limits of negative-control coverage.
- **B**: budget analysis below, grounded in `convex/lib/factoryConfiguration.ts`, `convex/lib/modelRouteAdmission.ts`, `convex/lib/executionRouting.ts`, `convex/workOrders.ts`, `convex/schema.ts`, `convex/workflowRuns.ts` and `apps/orchestration-server/src/codexExecutorAdapter.ts`.
- **L**: [last scoped inventory](../testing/evidence/fdlc-phase1-admission-bootstrap-2026-09-05/live-scope.json), observed 07:18 UTC; scope was not mutated by this task. C rechecked backend instance at 07:31 UTC, not every scoped record.

Source HEAD remains `f82fe1d98b156278c4fa0c0e2032008e2f010f39`. The only application
source-tree change in this task is a regression test; no production adapter,
worker, manifest, budget policy or configuration record was changed.

## Component table

| Component | Exact Identity | Qualification | Evidence | Currentness |
| --- | --- | --- | --- | --- |
| Runtime | `codex@0.146.0`, Darwin arm64; native SHA-256 `ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02`; artifact digest `sha256:dbd2a09c812ba8b2a5b5425f5386b0c65b2a399e40813374597d20bcfcd855fc` | Reproduction/startup evidence retained; bytes unchanged; read-only protection FAIL in candidate environment | M1–M3, C | Rehashed 07:31 UTC; temporary installation is not admitted |
| Host | NONE in project `sn71gskbdemgf4z1trt9zdmm5h8bde69`, tenant `wx7ajfqrhbjn1rxfz4tc32mekx8b639n` | BLOCKED_CONTAINMENT | L, M1–M3 | No registration/heartbeat/qualification |
| Containment | Candidate `fdlc-mutation-feasibility-v3`, configuration SHA-256 `b88a03002b422f17d3b999256b1820b1c6daf87b443e7462fea6274693a1dd79` | FAIL; direct tool feasibility only, not worker-integrated | M3 | Disposable resolved paths removed; never registered |
| Budget policy | No approved pilot revision; generic Factory budget plus explicit pilot hard-token prerequisite | BLOCKED; exact maxTokens unsupported | B, T | No equivalent-policy approval or qualified enforcement |
| Reservation | NONE | BLOCKED | B | No ID, expiry or real WorkOrder binding |
| Model route | NONE admissible in intended scope | BLOCKED by prerequisites | L | Last observed 07:18 UTC; no new record |
| Harness | `codex/v1`, `codex-cli@0.146.0`, source `e363b08c9175ac1cbe5893615dd2cb9ddf95043b`, manifest `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06` | Historical identity retained; new containment configuration NOT qualified | Prior report, B, M3 | Frozen manifest unchanged |
| Backend | Control plane `local-jaydubya818-missioncontrol_df0fe` at 3214, contract 40; proposed execution kind `persistent-worker`, no admitted profile/session ID | Control-plane identity PASS; execution backend BLOCKED | C, L | Instance rechecked 07:31 UTC; no worker started |
| Verifier | NONE | BLOCKED; producer cannot certify itself | L | No subject-bound receipt |
| Factory Version | NONE; draft definition `md7t93bxm0f2y6x9c9j7k20ted8ckfge` | BLOCKED; no freeze | L | Version count zero at last scope observation |
| Factory qualification | NONE | BLOCKED | L | No current receipt |
| Plan | NONE approved live ID/revision | BLOCKED | Prior report; none created | No governed subject |
| WorkOrder | NONE live ID/revision; WO1 is design ordinal | BLOCKED | Prior report; none created | No dispatch or Attempt |
| Readiness snapshot | NONE | NOT ISSUED | Prerequisites above | No issuedAt/expiration; static report is not readiness |

## Mutation evidence and execution-path limits

The probes ran the **exact native executable**, its real `sandbox` command,
macOS Seatbelt and foreground shell/subprocess/language commands. They did not
use a fake native runtime or prompt promises. Allowed mutations were restricted
in the candidate configuration to a disposable workspace and one disposable
admitted temp directory. All test scripts and raw argv are retained.

M1 exposed an unintended writable `/tmp` grant. M2 added filesystem-root default
denial, explicitly removed the global-temp grant, and allowed the Perl runtime
read dependencies so its direct-write test could actually run. M3 also set
`sandbox_workspace_write.exclude_slash_tmp=true` and
`sandbox_workspace_write.exclude_tmpdir_env_var=true`. These were qualification
experiments, not changes to the production execution configuration. No list of
individual sensitive files was used as the primary boundary. All configurations
still allowed the unique `/tmp` canary and writable opens of package files under
`/tmp/fdlc-runtime-0146`. The script reports these as **ALLOWED failures**, not
successful denial tests. Configuration parsing success does not prove enforcement.

Current official [permissions documentation](https://developers.openai.com/codex/permissions)
describes named filesystem profiles, root-default denial and temporary-directory
rules. These docs informed a probe, not a version-specific qualification claim:
the pinned binary's observed behavior takes precedence. The source-level cause
of the ineffective temporary exclusions remains unproven; no broader claim that
all Codex versions or all containment mechanisms fail is made.

The actual producing worker constructs its request in
`apps/orchestration-server/src/factoryAttemptWorker.ts` without
`filesystemReadScope: WORKSPACE_ONLY`. `commandArguments` in the adapter selects
`exec --sandbox workspace-write`. `runCodexProcess` spawns that native process
with the allowlisted environment and owned process group but no outer filesystem
sandbox. The profile experiments above are **not** this complete worker path.
They are failed feasibility evidence and must never be used as a worker receipt.
No worker was started, as explicitly required by the user. Full path qualification
remains absent, independently of the demonstrated candidate-profile failures.

A valid closure requires an enforced boundary for the actual native parent,
tools and descendants, with exact writable roots and read-only runtime resources.
A further profile guess, making the runtime file mode read-only for the same
owner, or moving the binary alone is insufficient: broad host-temp mutation would
remain. An outer OS boundary or a separately isolated execution environment could
be evaluated within Phase 1, but is not qualified here. It must preserve scoped
provider authentication, runtime identity, backend/host binding, cancellation,
cleanup and budget. Nothing is registered on the basis of an untested remedy.

## Full mutation-containment matrix

The following rows render M3 exactly. Every row is **direct native sandbox only**;
none proves the required worker path. `DENIED (EPERM)` means the retained stderr
shows Operation not permitted after the command started. OS ownership protections
may also contribute to `/etc` denial; it is not uniquely attributable to Seatbelt.
An actual missing `.aws` directory is NOT RUN, not a pass. No directory was created
there merely to obtain a result. Runtime probes open the exact existing files
for append with **zero bytes written**, testing mutation authority without
corrupting the admitted artifact. M1's language test failed to load libperl and
was inconclusive; M2/M3 explicitly exposed its read-only dependencies and reached
the denied write.

| Requested operation | Requested path | Canonical path | Expected | Actual | Enforcement / evidence |
| --- | --- | --- | --- | --- | --- |
| create workspace file | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/created` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/created` | ALLOWED | ALLOWED | Native sandbox / Seatbelt; M3 row 1 |
| modify permitted file | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/modify` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/modify` | ALLOWED | ALLOWED | Native sandbox / Seatbelt; M3 row 2 |
| delete generated file | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/delete-generated` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/delete-generated` | ALLOWED | ALLOWED | Native sandbox / Seatbelt; M3 row 3 |
| create admitted temp | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/admitted-temp/temp` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/admitted-temp/temp` | ALLOWED | ALLOWED | Native sandbox / Seatbelt; M3 row 4 |
| write /etc canary | `/etc/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/etc/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 5 |
| write host home | `/Users/jaywest/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 6 |
| write host ssh | `/Users/jaywest/.ssh/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/.ssh/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 7 |
| write host aws | `/Users/jaywest/.aws/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/.aws/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | NOT_RUN_PARENT_ABSENT | Native sandbox / Seatbelt; M3 row 8 |
| write host config | `/Users/jaywest/.config/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/.config/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 9 |
| write sibling repository | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 10 |
| write parent directory | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 11 |
| write unrelated temp | `/tmp/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/tmp/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | ALLOWED — FAIL | Native sandbox / Seatbelt; M3 row 12 |
| delete outside workspace | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/delete` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/delete` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 13 |
| rename across boundary | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/renamed` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/renamed` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 14 |
| move across boundary | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/moved` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/moved` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 15 |
| symlink escape | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/escape/symlink-write` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/symlink-write` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 16 |
| nested symlink escape | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/nested-escape/nested-write` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/nested-write` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 17 |
| hardlink outside inode into workspace | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/hardlink` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/hardlink` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 18 |
| shell redirection | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/redirect` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/redirect` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 19 |
| subprocess write | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/subprocess` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/subprocess` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 20 |
| language runtime direct write | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/language` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/language` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 21 |
| chmod outside | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chmod` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chmod` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 22 |
| chown outside | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chown` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chown` | DENIED | DENIED (EPERM) | Native sandbox / Seatbelt; M3 row 23 |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex` | DENIED | ALLOWED — FAIL | Native sandbox / Seatbelt; M3 row 24 |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex-code-mode-host` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex-code-mode-host` | DENIED | ALLOWED — FAIL | Native sandbox / Seatbelt; M3 row 25 |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-package.json` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-package.json` | DENIED | ALLOWED — FAIL | Native sandbox / Seatbelt; M3 row 26 |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-path/rg` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-path/rg` | DENIED | ALLOWED — FAIL | Native sandbox / Seatbelt; M3 row 27 |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-resources/zsh/bin/zsh` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-resources/zsh/bin/zsh` | DENIED | ALLOWED — FAIL | Native sandbox / Seatbelt; M3 row 28 |

## Cleanup and runtime currentness

All seven extracted package-file hashes match their earlier evidence. Original
global runtime 0.153.3 was not changed. C confirms the original Convex instance,
WO1 target hash `0672a5c2cd49b36550cdc2989ff7400ed3c6a55b81e51c46bfddda9de8fd3b88`,
absence of all three fixture roots and no processes matching their exact paths.
Every native sandbox child was waited/reaped; commands used foreground children.
Synthetic outside-file contents and modes remained unchanged.

Each failed run **did create one unique host `/tmp` canary** outside its admitted
temp area. Each was removed and recorded under `unexpectedHostCanariesRemoved`.
It would be false to claim no host mutation occurred during these tests. No
existing host files or real sibling repository files were intentionally modified;
only disposable sibling fixtures were mutation targets. No credential contents
were read or supplied; HOME/CODEX_HOME were synthetic, and provider calls were
zero. Cleanup attests the enumerated fixtures/package resources, not a global
host filesystem or all-process integrity scan. Network enforcement and full
credential/read containment remain unqualified for a producing worker.

Relevant experimental configuration changed between M1–M3, so no earlier
containment evidence carries forward as a pass. Bytes stayed identical and were
rehashed; the last production startup evidence remains the earlier exact-version
probe. There is **no new runtime-environment qualification receipt** because the
resource protection test fails. No historical receipt is overwritten.

## Budget semantics and policy decision

The strongest currently supported controls are not equivalent to a provider
spend ceiling. The native `exec --help` and adapter invocation/validation were
inspected without invoking `exec`. The selected path is the `codex/v1` OpenAI /
saved Codex authentication interface; there is no eligible exact model route.
Do not generalize the findings to every possible provider API.

| Dimension | Classification on selected path | Actual control / limitation |
| --- | --- | --- |
| Exact input/context tokens before provider request | UNAVAILABLE | No enforced tokenizer/context-total admission field propagated by this adapter; prompt length is not total context |
| Observed input tokens | OBSERVABLE_AFTER_CALL | JSONL usage may report input tokens; absent usage stays unknown |
| Observed output tokens | OBSERVABLE_AFTER_CALL | JSONL usage may report output tokens; not a pre-spend ceiling |
| Exact output-token ceiling | UNAVAILABLE | Adapter rejects `reasoningConfig.maxTokens`; cannot claim propagation to provider |
| Total token ceiling across agent loop | UNAVAILABLE | No enforced loop-total token contract in selected adapter |
| Prompt-only token estimate | ESTIMABLE | An estimate cannot bound tool output, history, compaction or subsequent calls; no estimate used as authority |
| Logical native execution starts / Attempts | ENFORCEABLE_BEFORE_CALL at orchestration boundary | Frozen Factory maxAttempts and worker claims can bound native starts; not a bound on internal model invocations |
| Provider request count / internal retries | UNAVAILABLE | Manifest exposes neither authoritative counts nor pre-call caps |
| Mission Control retry/Attempt eligibility | ENFORCEABLE_BEFORE_CALL at orchestration boundary | Separate from opaque native retries; proposed zero automatic retries not yet frozen for this pilot |
| Wall-clock | Enforced process deadline, not a token classification | Adapter requests termination at timeout, escalates signals after 5 seconds; cannot undo spend or guarantee provider termination at that instant |
| Tool-call / loop-iteration ceiling | UNAVAILABLE as pre-execution cap | Tool events support observation; adapter exposes no admitted hard count limit |
| Monetary reservation | ENFORCEABLE_BEFORE_CALL for accounting commitment when a valid governed subject exists | Not provider billing enforcement; actual saved-auth monetary liability UNKNOWN |
| Monetary actuals | UNAVAILABLE on saved-auth path | Never infer zero or convert an estimate to measured cost |

`convex/lib/factoryConfiguration.ts` requires maxCostUsd, maxRuntimeMinutes and
maxAttempts; its generic schema does **not** require a token cap.
`reasoningConfig.maxTokens` is optional route configuration. The stricter pilot
requirement comes from the accepted preparation/admission constraints and the
[execution proposal, Readiness and budget](fdlc-phase1-execution-proposal.md):
resolve the supported hard token cap before GO; do not replace it with an estimate.
The current user request expressly preserves that hard requirement if required.
No approved equivalent policy was found. Thus generic optionality is not authority
to remove the pilot prerequisite.

For GREEN/YELLOW, `executionRoutingEstimatedCost` permits an approved Plan estimate
when route-wide pricing is absent. That is a routing accounting rule, not a token
waiver. Full-cap reservation policy permits actual telemetry UNAVAILABLE with a
reason. Neither supplies pre-spend enforcement of internal calls/retries/output
tokens or a monetary liability ceiling. No governance or validator was weakened.
The new regression test proves a hard-cap request fails before the process runner;
it intentionally does not add fake support for an unsupported control.

## Reservation audit

Reservation ID: NONE. Scope would be the intended project/repository and real
WO1 revision plus producing/verifying eligibility; those subjects do not exist.
Proposed $2/WO1, $1 per producing/verifying execution and $20 cohort remain
unapproved estimates, not maximum attributable liability. Known pilot model
calls here: zero. Actual monetary liability for future execution: UNKNOWN.

The existing authority is embedded in `workflowRuns.executionCostAuthorization`
and `reservedCostUsd`, composed by governed WorkOrder dispatch/routing. It is not
a separately implemented expiring, single-use provider-request coupon. The schema
records authorizedAt but no dedicated reservation expiresAt. Run/lease/approval
currentness does not by itself establish the requested reservation-expiry contract.
Creating it via dispatch would violate this task, and a standalone fake reservation
would misrepresent the architecture. No reservation was created.

The generic `workflowRuns:updateStatus` path converts remaining reservation to
spentUsd for COMPLETED/FAILED and releases it for CANCELED; this bookkeeping cannot
be presented as measured provider cost. Exact actual-cost status must remain
separate. Recovery has evidence-bound release checks; routing accounts for prior
commitments. End-to-end settlement/currentness/idempotent use on a real pilot
subject is NOT QUALIFIED. An unknown charge must not be silently reported as zero.

## Budget negative controls

| Required control | Result / exact evidence | Remaining qualification |
| --- | --- | --- |
| Missing reservation | No real subject; NOT RUN as live dispatch test. Existing recovery suite passes, but is not reservation admission | Prove governed admission denies missing authority |
| Expired reservation | BLOCKED: no dedicated reservation expiry field in current authority schema | Cannot claim expiry enforcement from an approval or lease timeout alone |
| Wrong WorkOrder reservation | NOT RUN on real tuple; cost source schema includes WO/revision but shape validation is not cross-subject proof | Subject-bound admission/replay test required |
| Wrong workspace | NOT RUN on real reservation tuple | Scope binding test required |
| Request exceeds provider-call cap | UNSUPPORTED, not a passing test | No exposed hard provider-call counter/cap |
| Retry exceeds retry cap | Routing budget-remainder test PASS (T); opaque provider retry cap UNSUPPORTED | Native provider retries remain unresolved |
| Attempt exceeds Attempt cap | Factory configuration bounds test PASS; candidate-specific Attempt exhaustion NOT RUN | Real frozen maxAttempts and governed claim test required |
| Output-token request exceeds allowed provider limit | New hard-token regression PASS: entire unsupported request rejected, runner never called | No valid provider-supported ceiling exists on selected adapter |
| Wall-clock exceeded | Source timeout/signal enforcement exists; no new live runtime timeout receipt | Does not prove provider spend stops at deadline |
| Duplicate/replayed reservation use | NOT RUN on real tuple; existing run fencing is not a demonstrated single-use budget coupon | Governed replay semantics need evidence |

T records 44 existing tests passing across Factory configuration, route admission,
routing evidence and pre-execution recovery, plus 3 focused adapter tests passing
(12 skipped), including the new no-process-start hard-token regression. These are
control tests only. No fake provider was used to manufacture support for fields
that the actual adapter cannot enforce; no behavioral/provider qualification is
claimed. A model call would not repair absent control propagation or the filesystem
escape, so none is requested or authorized here.

## Dependent qualification, tuple controls and readiness

No host/containment registration, budget authority, verifier, route, harness/backend
qualification, Factory Version or Factory receipt was created. This preserves the
explicit dependency order. No producer identity was reused for verification.
No real Plan or WO was created to make a readiness query possible.

Wrong runtime/digest source rejection is covered by the focused adapter test;
mutated-resource **protection fails** in M1–M3. Wrong host, containment receipt,
missing/expired/wrong budget, wrong route/harness/backend/verifier, stale verifier
or Factory qualification and Plan/WO revision mismatch remain **NOT RUN on an exact
tuple**, because no qualified tuple exists. Existing unit tests must not be
represented as passing all these candidate controls.

Readiness: **NOT ISSUED**. Issued timestamp, expiration, Factory/policy/repository
revision binding and currentness receipt are absent. There is no manual READY.

No model call, worker start, WO1 dispatch, pilot candidate, PR, publication, merge,
release, deployment or Phase 2 work occurred. This report stops at the explicit
runtime-resource and budget gates; it does not ask for a blanket execution waiver.

Final disposition:

**NO_GO**

## Final blocker decision — 2026-09-05

[Final Admission Report](fdlc-workorder-01-final-admission-report.md) retains
BLOCKED_CONTAINMENT and requests an explicit budget-policy decision. An outer OS
write allowlist allows native startup in a diagnostic configuration but the nested
Codex sandbox fails before tool execution. Original budget instructions specify
token limits without separate input/output semantics or numeric caps; no global
Factory token gate or approved equivalence was found. No gate was weakened.
