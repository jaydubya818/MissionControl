# FDLC Phase 1 — WorkOrder 1 Final Admission Report

Final disposition: **BUDGET_POLICY_DECISION_REQUIRED**.

Containment result: **BLOCKED_CONTAINMENT**.
Budget result: **BUDGET_POLICY_DECISION_REQUIRED**.
Neither result grants execution authority. Dependent registration, Factory freeze,
qualification and readiness remain prohibited. Observations: 2026-09-05 UTC.

## Containment: structural boundary evaluation

The proposed writable surfaces are exactly one workload workspace and one private
bounded ephemeral directory. Runtime, libraries, policy/configuration and
qualification artifacts must be outside both writable roots and read-only to
**every workload process**, including the native parent. The eventual environment
may map these to `/workspace`, `/runtime` and `/tmp/workload`; those are conceptual
paths, not existing admitted mounts.

The existing worker selects `exec --sandbox workspace-write` through
`factoryAttemptWorker.ts` → `CodexV1ExecutorAdapter` → `runCodexProcess`. Its child
environment inherits a temp variable and its actual native subprocess is not
inside an outer filesystem boundary. The three earlier profile experiments
showed that overriding Codex permission configuration did not remove writable
global-temp authority; runtime files stored under `/tmp` consequently remained
writable. This identifies the authority leak in the selected execution design:
private temp settings alone do not restrict the process's other writable paths.
The exact internal Codex source cause remains UNKNOWN; the pinned source-file
fetch was unavailable and source code was not fabricated from the observations.

I evaluated a **structural outer macOS Seatbelt boundary**, not another list of
forbidden paths. It starts from deny-default and grants file writes only to the
two explicit workspace/private-temp roots. It grants no general `/tmp` write
permission. `TMPDIR`, `TEMP` and `TMP` all point to the private temp directory.
The policy is supplied to the OS before spawning the exact native executable;
the workload cannot rewrite it from a writable configuration file. The diagnostic
policy files/receipts remain outside its writable roots. This mechanism would
prevent broader permissions in a child from expanding the outer write authority.
It is **not admitted**, for the compatibility reasons below.

Evidence directory:
`docs/testing/evidence/fdlc-phase1-final-admission-2026-09-05/`.

- [Initial outer-boundary result](../testing/evidence/fdlc-phase1-final-admission-2026-09-05/outer-boundary-probe-initial.json): restricted readable surfaces; exact native startup aborts with signal 6. No tool command executes.
- [Restricted-read retest](../testing/evidence/fdlc-phase1-final-admission-2026-09-05/outer-boundary-probe-restricted-read.json): permitting executable mappings did not repair startup.
- [Compatibility diagnostic](../testing/evidence/fdlc-phase1-final-admission-2026-09-05/outer-boundary-probe.json): allowing reads broadly **for diagnosis only**, while preserving the exact write allowlist, permits `codex-cli 0.146.0` startup; its nested tool sandbox then exits 71 with `sandbox-exec: sandbox_apply: Operation not permitted`.

Last diagnostic policy SHA-256:
`702cf8c262350538a1dd1e6d51dc72275dfa95b69d33636159c3f88e2ef6ca3a`.
The JSON contains the exact absolute fixture roots and complete policy.
The broad-read diagnostic is not credential/read-containment qualification.
Restricted-read startup's precise missing dependency remains unproven. The nested
sandbox failure is directly observed; no universal platform impossibility is claimed.

This is not a production-shaped worker success. The necessary native/tool path
fails before the allowed workspace mutation runs. Starting a worker or issuing
host authority cannot repair that prerequisite. No worker was started. I did not
disable the native sandbox, swap to a different runtime, give the workload broad
write access, or claim helper evidence qualifies the worker.

### Structural closure still required

An admissible implementation must put the **actual worker-launched native process
and tools** inside one coherent containment boundary. A separately qualified
execution environment with a read-only runtime image and a private bounded temp
volume is the next candidate to evaluate. The Darwin executable cannot silently
be relabelled as a Linux container artifact. Alternatively, a deliberate new
host/harness configuration could use a single outer OS boundary, but replacing
the native sandbox mode would change effective configuration and requires its own
complete qualification; it is not applied here.

The worker's immutable execution profile must bind the boundary policy digest,
read-only runtime/artifact digest, workspace root, private-temp root, temp quota,
cleanup and cancellation semantics. Provider authentication and evidence/config
resources must be provisioned outside workload write authority. Merely moving
the executable, changing file modes, setting temp variables, adding deny paths,
or checking hashes after execution does not establish that contract.

Private-temp capacity is **UNQUALIFIED**: the probes isolated a directory but did
not enforce a byte/inode quota. A proposed 256 MiB private temp volume for this
single documentation workload would need actual backend enforcement, exhaustion
handling and a separate qualification receipt. It is not an installed limit.

### Mutation and private-temp matrix

`M3` below means the retained prior
[actual native sandbox matrix](../testing/evidence/fdlc-phase1-admission-closure-2026-09-05/mutation-matrix.json).
It records each requested and canonical absolute path, raw output, exit status,
expected result and enforcement layer. `O` means the new outer diagnostic above.
**No row qualifies the full worker path.** O cannot execute the tool command,
so its operation matrix is NOT RUN, not an all-green denial result.

| Operation | Requested path | Canonical path | Expected | Prior actual / layer | Current worker evidence |
| --- | --- | --- | --- | --- | --- |
| create workspace file | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/created` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/created` | ALLOWED | ALLOWED; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| modify permitted file | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/modify` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/modify` | ALLOWED | ALLOWED; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| delete generated file | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/delete-generated` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/delete-generated` | ALLOWED | ALLOWED; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| create admitted temp | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/admitted-temp/temp` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/admitted-temp/temp` | ALLOWED | ALLOWED; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write /etc canary | `/etc/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/etc/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write host home | `/Users/jaywest/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write host ssh | `/Users/jaywest/.ssh/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/.ssh/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write host aws | `/Users/jaywest/.aws/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/.aws/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | NOT_RUN_PARENT_ABSENT; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write host config | `/Users/jaywest/.config/fdlc-mutation-matrix-8k08l3j_.canary` | `/Users/jaywest/.config/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write sibling repository | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write parent directory | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| write unrelated temp | `/tmp/fdlc-mutation-matrix-8k08l3j_.canary` | `/private/tmp/fdlc-mutation-matrix-8k08l3j_.canary` | DENIED | ALLOWED — FAIL; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| delete outside workspace | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/delete` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/delete` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| rename across boundary | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/renamed` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/renamed` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| move across boundary | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/moved` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/moved` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| symlink escape | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/escape/symlink-write` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/symlink-write` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| nested symlink escape | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/nested-escape/nested-write` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/nested-write` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| hardlink outside inode into workspace | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/hardlink` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/workspace/hardlink` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| shell redirection | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/redirect` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/redirect` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| subprocess write | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/subprocess` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/subprocess` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| language runtime direct write | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/language` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/language` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| chmod outside | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chmod` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chmod` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| chown outside | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chown` | `/private/var/folders/1h/qb01w7v52bb72nzk2dh3szbc0000gn/T/fdlc-mutation-matrix-8k08l3j_/sibling-repository/chown` | DENIED | DENIED (EPERM); M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex` | DENIED | ALLOWED — FAIL; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex-code-mode-host` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex-code-mode-host` | DENIED | ALLOWED — FAIL; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-package.json` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-package.json` | DENIED | ALLOWED — FAIL; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-path/rg` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-path/rg` | DENIED | ALLOWED — FAIL; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| runtime resource writable-open, no bytes written | `/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-resources/zsh/bin/zsh` | `/private/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/codex-resources/zsh/bin/zsh` | DENIED | ALLOWED — FAIL; M3 native Seatbelt | NOT RUN; O nested sandbox fails |
| modify policy/config | O policy/qualification resources | UNBOUND — no working admitted environment | DENY | NOT RUN | NOT RUN; O prerequisite fails |
| chmod/chown runtime | exact runtime files | UNBOUND — no working admitted environment | DENY | NOT RUN | NOT RUN; O prerequisite fails |
| enumerate private temp | O private-temp root | UNBOUND — no working admitted environment | ALLOW | NOT RUN | NOT RUN; O prerequisite fails |
| read another host process temp | unrelated synthetic temp fixture required | UNBOUND — no working admitted environment | DENY | NOT RUN | NOT RUN; O prerequisite fails |
| random private-temp filename | O private-temp root | UNBOUND — no working admitted environment | ALLOW | NOT RUN | NOT RUN; O prerequisite fails |
| temp symlink escape | O temp → outside | UNBOUND — no working admitted environment | DENY | NOT RUN | NOT RUN; O prerequisite fails |
| rename from temp outside | O temp → outside | UNBOUND — no working admitted environment | DENY | NOT RUN | NOT RUN; O prerequisite fails |
| subprocess private-temp write | O TMPDIR/TEMP/TMP root | UNBOUND — no working admitted environment | ALLOW | NOT RUN | NOT RUN; O prerequisite fails |

All absolute paths and stderr are retained in M3. The added operation targets
are deliberately unbound where no working environment exists. No synthetic path
is substituted for a real admitted worker subject.

### Cleanup/currentness

All O fixture directories were removed in finally blocks and every launched
process was waited. The failures may produce normal macOS diagnostic reports;
two test-generated Codex crash-report filenames were observed. Those platform
reports were not deleted. No global-temp canary was created by O because its tool
command never executed. This is not a global host integrity attestation.
Prior M3 failures did create unique host-temp canaries; their recorded removal
must not be rewritten as “no host mutation.” No existing sibling repository or
credential/config file was a write target in this turn. Exact runtime package
and original WO1 target hashes are checked in [final-integrity.json](../testing/evidence/fdlc-phase1-final-admission-2026-09-05/final-integrity.json); no runtime bytes,
global installation or original control-plane instance was changed.

## Budget policy provenance — decision required

The exact original sources are retained, with file hashes and line-numbered
excerpts, in [budget-policy-provenance.json](../testing/evidence/fdlc-phase1-final-admission-2026-09-05/budget-policy-provenance.json):

1. User's Phase 1 pre-execution instructions, section 18, lines 645–671 of
   attachment `56167e07-96f1-4673-956c-2f0ee2e24174/pasted-text.txt`: define a
   bounded pilot budget using existing controls, record token/retry/Attempt/time
   limits and preserve hard-budget admission; unknown monetary cost stays UNKNOWN.
2. User's WO1 continuation, section 7, lines 281–307 of attachment
   `5de573d0-245f-4c38-855b-2438227a547c/pasted-text.txt`: resolve token/time/retry/
   Attempt limits, monetary limits where known and reservation behavior; do not
   weaken hard-budget admission.
3. Subsequent user bootstrap/closure requests explicitly retain the unresolved
   hard token gate pending proof or an explicit governance decision.

Scope: the bounded Phase 1 pilot and WO1 admission. Purpose: prevent execution
without explicit resource authority, prevent silent cap omission and unbounded
retries, and keep unknown costs truthful. This is not a UI-label inference.

**Exact input-token cap: unspecified. Exact output-token cap: unspecified.
Numeric cap and aggregation window: unspecified. Equivalence rule: absent.**
The preparation document's “hard token limit ... before GO” is a stricter
operationalization of the user instructions, not a discovered global database
policy with defined input/output semantics. Earlier reports should not be read
as proving a globally configured exact-input-and-output gate.

`convex/lib/factoryConfiguration.ts` requires cost, runtime and Attempt bounds.
`convex/lib/modelRouteAdmission.ts` makes `maxTokens` optional. Neither is an
approved policy equivalence rule for this pilot. The unresolved prerequisite
blocks the **WorkOrder's pilot execution approval**; it prevents dependent Factory
qualification here by the user's explicit dependency order. It is not evidence
that every Factory globally requires a token field. No frozen pilot Factory or
approved Plan exists that settles this ambiguity.

### Runtime capability matrix

Selected source path: `codex/v1` with pinned 0.146.0 and saved Codex/OpenAI auth;
there is no eligible exact provider/model route in the pilot scope.

| Dimension | Classification | What can truthfully be promised |
| --- | --- | --- |
| Input-token limit | UNAVAILABLE; usage OBSERVABLE after completion; prompt-only amount ESTIMABLE | No exact total-input pre-call cap propagated by this adapter |
| Output-token limit | UNAVAILABLE; usage OBSERVABLE after completion | `maxTokens` request is rejected, not silently translated |
| Provider call count | UNAVAILABLE | Neither enforceable count nor complete request telemetry; one native start is not one provider call |
| Native internal retry count | UNAVAILABLE | Neither enforceable nor authoritatively observable; do not force it into either requested label |
| Mission Control retries | ENFORCEABLE at scheduler/Attempt boundary | Zero newly authorized retries can be required; distinct from native retries |
| Wall-clock | ENFORCEABLE for process termination request; OBSERVABLE | 900 seconds then SIGTERM; escalation after 5 seconds; no guarantee provider spend terminates instantly |
| Attempt count | ENFORCEABLE at governed admission boundary | One producer and one separate verifier Attempt proposed, each requires its own authority |
| Loop/step count | UNAVAILABLE as a hard native cap | Tool-event observation is not an internal iteration ceiling |
| Monetary cost | ESTIMABLE accounting reservation / UNKNOWN actual liability | No attributable provider-enforced monetary ceiling on selected saved-auth path |

The manifest expressly marks provider-request/retry and monetary telemetry
unsupported. The new regression test from the prior turn proves hard maxTokens
requests fail before the runner starts; it does not prove token enforcement.

### Strongest supported alternative — PROPOSED, NOT APPROVED

Proposed identity: `fdlc-wo1-resource-envelope/v1-proposed`. This is a document
identifier, not a registered budget authority or a claim of token/spend equivalence.

| Dimension | Proposed contract |
| --- | --- |
| Producing Attempts | Maximum 1 |
| Independent verifier Attempts | Maximum 1, separate identity and authorization |
| Mission Control automatic retries | 0; corrections require a new human authorization |
| Concurrent pilot executions | 1 |
| Process deadline | 900,000 ms per Attempt; SIGTERM then up to 5,000 ms escalation; failed termination blocks further execution |
| Maximum native starts | 2 total across the separately bounded producer/verifier Attempts, subject to enforced no-retry/no-resume admission |
| Provider calls / internal retries / native loops | UNKNOWN/UNBOUNDED by this adapter; no invented cap |
| Input/output token ceiling | NONE enforceable by selected adapter; explicitly accepted exception required |
| Accounting reservation | $1 per Attempt, $2 total WO1; must not overcommit the proposed $20 pilot envelope |
| Actual monetary liability | UNKNOWN, not capped by the accounting reservation and not zero |
| Settlement | Retain measured-versus-unknown actual status; reservation must not be reported as measured spend |
| Scope | Exact workspace, repository/base, WO/Plan revisions, execution profile/runtime, route and producer/verifier identity |
| Claim validity / replay | Proposed 15-minute claim window, consume once per exact Attempt, no reuse after cancel/failure; requires implementation/qualification because current embedded reservation has no independent expiry |

Rationale: these controls bound orchestration occupancy and starts using supported
mechanics while exposing opaque provider dimensions honestly. They **do not bound
total token consumption or provider liability**. This is weaker than requiring an
actual hard token/spend ceiling, not an equivalent contract.

**Decision for Jarrett West:** retain a hard token/spend requirement and select a
separately qualified path that enforces it, or explicitly approve the resource-only
envelope above with unknown provider liability. Recommendation: retain the hard
requirement until an enforceable path is selected. Do not approve the resource-only
envelope on the assumption that $2 is a provider billing ceiling.

No policy, adapter, qualification gate or reservation semantics were changed.
Budget-policy approval alone would not close containment or authorize WO1.

### Reservation design and negative controls

No reservation is created. A future governed reservation would bind exact scope,
WO/Plan revisions, execution profile/runtime/route, the separate eligible Attempt,
authorized dimensions, issue/expiry times, idempotency key and consumed/released/
settled state. Missing IDs are unresolved, not placeholder records. The current
`executionCostAuthorization` is embedded in a workflow run, contains authorizedAt
and estimates/actual-cost status, and has no independent expiresAt. Dispatch is
not permitted as a way to manufacture a reservation.

The proposal's fixed accounting amount is finite; provider liability remains
unknown. If governance requires bounded monetary liability, this design is not
admissible. Expiry, exact profile binding and replay requirements must be added
and tested only after the policy contract is decided; no unbounded authorization
or fake receipt was created now.

| Negative control | Available evidence / unresolved proof |
| --- | --- |
| Missing reservation | NOT RUN on real subject; remains a required admission denial |
| Expired reservation | No dedicated expiry semantics in current embedded authority; decision/design pending |
| Wrong WO / workspace / execution profile | Future exact binding required; NOT RUN on candidate tuple |
| Provider call cap exceeded | Unsupported field on selected path; cannot claim denial |
| Native retry cap exceeded | Unsupported; Mission Control retry authority must remain distinct |
| Output-token cap requested | Prior regression PASS: unsupported request rejected before process runner |
| Wall-clock exceeded | Process timeout/signaling implementation exists; exact environment qualification remains absent |
| Attempt cap exceeded | Existing configuration/routing controls and implementation-policy admission exist; real tuple exhaustion test not issued |
| Replayed reservation | Single-use/expiry contract pending; existing fencing is not proof of a new coupon design |

The earlier 44 policy/routing tests and 3 focused adapter tests are preserved at
their source/configuration; no duplicate green rerun was needed. No fake provider
was used to falsely qualify unsupported dimensions. Once the contract is decided,
deterministic control tests can exercise only the actual supported/implemented
fields. External model/provider calls performed: zero.

## Full tuple and currentness

| Component | Identity | Qualification | Evidence | Currentness |
| --- | --- | --- | --- | --- |
| Runtime | `codex@0.146.0`, native SHA-256 `ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02`; artifact `sha256:dbd2a09c812ba8b2a5b5425f5386b0c65b2a399e40813374597d20bcfcd855fc` | Bytes retained; environment NOT qualified | Outer probe, earlier package manifest | Rehashed 07:49 UTC; repeat before future admission |
| Host | NONE; project `sn71gskbdemgf4z1trt9zdmm5h8bde69`, tenant `wx7ajfqrhbjn1rxfz4tc32mekx8b639n` | BLOCKED_CONTAINMENT | Failed native/tool boundary | No registration/heartbeat |
| Containment | Outer diagnostic policy SHA above | BLOCKED; nested native tool cannot start | Outer JSON | Fixture paths deleted; not an admitted profile |
| Private temp | Exact disposable roots in outer JSON; TMPDIR/TEMP/TMP aligned | Isolation attempt only; quota NOT qualified | Outer JSON | Removed; no host-global writable grant proposed |
| Budget | `fdlc-wo1-resource-envelope/v1-proposed` | POLICY DECISION REQUIRED | Source excerpts and contract above | Not approved/frozen |
| Reservation | NONE | BLOCKED | Contract unresolved | No expiry or consumed state |
| Model route | NONE admissible | BLOCKED | Retained scoped inventory | No new registration |
| Harness | `codex/v1`, manifest `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06` | Historical identity only; proposed outer execution environment incompatible/unqualified | Source and probe | Frozen manifest unchanged |
| Execution backend | `persistent-worker` proposed; exact profile/session NONE | BLOCKED | Worker source / failed prerequisite | No worker started |
| Control plane | `local-jaydubya818-missioncontrol_df0fe`, localhost:3214, contract 40 | Preserved; not execution qualification | Prior inventory / final integrity check | Query observation only |
| Verifier | NONE | BLOCKED | Dependencies unresolved | Producer not reused |
| Factory Version | NONE; draft `md7t93bxm0f2y6x9c9j7k20ted8ckfge` | BLOCKED | Retained scope inventory | No freeze |
| Factory qualification | NONE | BLOCKED | Two hard gates unresolved | No receipt |
| Repository | `k17wswvrva7ky172eej2w1nj858cbzt7`; `jaydubya818/MissionControl`; proposed base `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38` | Design identified; final governed execution scope still absent | Prior proposal | WO1 file unchanged |
| Plan revision | NONE approved real subject | BLOCKED | No creation/approval in this task | No bound revision |
| WorkOrder revision | NONE authorized real subject | BLOCKED | WO1 remains a design ordinal | No dispatch |
| Readiness | NONE | NOT ISSUED | Hard gates and dependent identities missing | No issuance or expiration |

Uncontained host, writable runtime and wrong-temp policy remain ineligible based
on failures. Missing/expired/wrong budget, wrong route/verifier and stale Factory
qualification must reject, but a complete candidate negative-control suite cannot
be claimed without those exact qualified identities. No manual override, downstream
registration, Factory Version, qualification or readiness snapshot was issued.

Owning team remains FDLC / Mission Control. Jarrett West remains Champion, Human
FDE / Operator and Incident Commander; no approval/verification gates are combined.
No pilot model call, worker dispatch, candidate, PR, publication, merge or release
occurred. Stop for the explicit budget contract decision; containment remains a
separate technical blocker regardless of that decision.

Final disposition:

**BUDGET_POLICY_DECISION_REQUIRED**
