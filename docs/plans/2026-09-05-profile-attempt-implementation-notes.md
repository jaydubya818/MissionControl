# Profile and Attempt integration — implementation notes

Status: INCOMPLETE. This is a development checkpoint, not a completion receipt or a GO recommendation. The September 5 continuation below supersedes earlier implementation-status and artifact entries, which remain historical.

Baseline: `0d1a0908cce380d815069ce0a59e1604d2f26ece`; working branch: `codex/profile-attempt-closure`.
Working checkout: `/private/tmp/skill-qualification-20260904/profile-attempt-closure`.
No external model calls, pushes, merges, production activation or deployments have occurred in this work.

## Implemented development changes

- Existing Execution Profile storage, qualification and currentness support a versioned offline composition. Inference is explicitly denied; transmission is DENY_ALL; provider call and liability limits are zero. There is no fake modelCatalog row. Historical inference-route backend types remain unchanged.
- Existing Sandbox Profile storage supports a local isolated image and an independently approved offline admission receipt. The Execution Profile binds that exact admission digest and promotion time. Re-approval of unchanged sandbox bytes invalidates the prior composition.
- Bridge/backend IDs, versions, schemas and implementation digests must match registered metadata, in addition to matching each other. Profile snapshots cannot add MCP Tool Grants to the offline path.
- Invocation v2 binds Task, Plan identity/version/digest, Factory Version/configuration digest and budget reservation alongside existing Attempt, WorkOrder, profile, runtime, composition and lease fields.
- A bounded `render-markdown/v1` operation produces actual candidate document content. It cannot execute a shell or load modules. Host scope, symlink, nonempty-change, Git identity and independent verification gates remain mandatory and are not yet wired for this operation.
- Policy denial and budget denial are explicit terminal result statuses. Runtime response bytes are retained separately with `authority: NONE` when the host rejects acceptance as stale or canceled. UTF-8 is decoded after bounded byte collection.
- The backend loader hashes bounded bytes before importing those same bytes through a data URL. It rejects unregistered bundles and symlink entry paths.
- The pinned esbuild builder captures and hashes the actual source bytes supplied to the bundler, retains those input snapshots, and records bundle identities. Build output confers no qualification or execution authority.

## Current local artifacts

These identify offline controls only; no canonical profile or Attempt has been admitted from them.

- Image: `sha256:7d2fa08e52c0ba56eb051050a92077cca7626704187187dff2f238fe8292ef6f`.
- Bridge bundle: `sha256:ad84b5c8758316c67d2a932e7c045cec2912a81171417069e9dda839b6971d02`.
- Backend bundle: `sha256:e6e4cd54f704d5bae477c70a9003484c8c0e338f5ba1064099846bb4b27d010b`.
- Build/input snapshots: `/private/tmp/skill-qualification-20260904/profile-closure-build-3`.
- Container build context: `/private/tmp/skill-qualification-20260904/profile-closure-container-build-3`.
- Direct controls: `/private/tmp/skill-qualification-20260904/profile-closure-invocation-controls-3`.
- Isolation controls: `/private/tmp/skill-qualification-20260904/profile-closure-isolation-proof-3`.

The registered manifest's source-commit provenance is still provisional and must be replaced with an actual implementation commit before qualification. Do not treat the baseline commit as containing this implementation. All prior build/control directories are preserved, including records preceding review fixes.

## Verification performed

- Authoritative codegen succeeded against a disposable loopback Convex backend; generated API declarations were not edited manually. The first codegen failed because the sanitized backend PATH omitted Node; that failed log is preserved.
- Full `pnpm run test` passed with local socket permission after the bridge evidence-retention and child-drain changes. This includes 946 Convex tests. The initial sandbox-blocked test run was interrupted and preserved; it cannot count as a PASS.
- 24 focused backend/loader tests passed after those changes, including split UTF-8, preservation of a stale actual runtime result, and bounded child closure/evidence retention after an event callback failure.
- 11 bounded document operation tests passed.
- Four actual container controls passed again on the current image: SUCCESS, STALE, CANCELED and TIMED_OUT; container cleanup was verified. SUCCESS returns document content. STALE preserves the actual runtime SUCCESS response as non-authoritative evidence.
- The existing isolation runner passed on the current image. These are control fixtures, not behavioral evaluation results.
- The current System/Factory Qualification passed all 19 checks with provider credentials excluded from the process environment. Its result does not prove the new canonical path. Repository-wide checks are recorded separately in `/private/tmp/skill-qualification-20260904/profile-closure-current-checks`; inspect exit codes and logs before making any aggregate claim.

## Independent review findings and dispositions

An independent review identified: registration-only identity comparison, sandbox re-approval currentness inconsistency, discarded stale runtime responses, per-chunk UTF-8 corruption, and hashing source files after bundling. The development changes above address these findings. A subsequent child-closure finding was also fixed and independently verified. A hardcoded v41 docs negative-control fixture was repaired to derive its intentionally stale version from the current source version, without weakening the drift check. No end-to-end independent GO has been issued.

The review also confirmed that a receipt-only success is not a software candidate. The deterministic operation must enter the existing candidate validation and independent verification stages. It must not bypass software gates or fabricate a provider route.

## Exact remaining work

Continuation: the operator approved completing the persistent worker registration wiring. The shared discriminated validator now governs storage and reports; offline bindings cannot carry inference identities. Canonical invocation construction and source-currentness controls passed 45 focused tests. Candidate materialization uses the existing Git patch boundary, with real Git scope/symlink negative controls. These helpers do not yet enable dispatch. Next, add a versioned offline resource reservation in the existing Attempt cost authorization, conservatively retaining unknown terminal costs; then complete canonical dispatch and ingestion before enabling admission. No provider price or model route is fabricated.

1. Extend the existing versioned workflow contract for an explicitly deterministic operation; preserve existing inference workflow semantics. Freeze the registered operation and immutable input in the existing Factory execution manifest.
2. Complete existing Factory Version creation, WorkOrder readiness/admission and Task/WorkflowRun freeze for the offline composition. Current paths still require inference routes and correctly reject this unfinished integration.
3. Complete canonical claim/dispatch, worker construction and result ingestion. The registry still does not advertise this backend. Adapter health remains unavailable for canonical execution.
4. Recheck Plan, WorkOrder, Task, Factory Version, profile, isolation admission, budget and lease at dispatch and atomically before accepting results. Preserve bounded late evidence without granting candidate or acceptance authority.
5. Materialize runtime-produced candidate content through existing scope and symlink protections, nonempty-change/Git identity checks and independent verifier binding. Do not treat control receipts or host-synthesized output as producing-runtime evidence.
6. Prove duplicate dispatch/completion, corrective attempts, timeout, cancellation, stale identities and late result handling through the actual canonical spine.
7. Exercise the actual local browser/operator path at desktop and 390px with refresh persistence.
8. Finish all required local suites, security/docs/startup/System Qualification and independent reviews; fix failures.
9. Commit, push and open the dedicated PR only after local qualification. Verify merge will not trigger prohibited production deployment, obtain required green CI/reviews, merge, and repeat qualification in a clean final-main checkout.
10. Create immutable completion evidence only after those requirements are met. Keep Mission Control PR165 Draft/NO-GO for its broader qualification, and leave FDLC/Guide PR11 unpromoted.

## Runtime contract accounting

Baseline contract 41 was incremented once to 42 in the working tree. Public changes: the new workspace-authorized isolated Sandbox Profile registration mutation; additive offline promotion semantics; additive offline backend selection and optional modelCatalog input for existing Execution Profile registration; associated Sandbox/Profile record validator unions and optional inference-only fields. An absent model route remains invalid for historical inference profiles. Default and explicit-baseline guards must pass before merge; no further increment is intended in this task.

## September 5 continuation: applied work and remaining authority block

The approved worker schema/report wiring is implemented. The versioned manifest constructor, exact persisted-profile binding, conservative offline resource-reservation data constructor, canonical invocation validation, worker execution/materialization branch and evidence-only ingestion are implemented but do not enable canonical dispatch. Resource reservations are not yet transactionally wired across WorkOrder, Mission and policy budgets. Startup does not enable the new composition, and the offline claim gate remains closed.

Cleanup failures now preserve the already-collected runtime response through HarnessCleanupError, fail the host disposition and prevent candidate materialization. Independent review found and closed an evidence-origin spoofing defect: generic and legacy writers now reject reserved offline response and claim-event identities; public event writes require workspace write permission; stored responses are revalidated for byte digest, exact request, scope, producer and lease before replay or candidate eligibility. Eight focused tests pass. The reviewer confirmed this specific finding closed, with overall qualification NO-GO.

Generation 4 controls used image `sha256:344d935793250b44e958a5b09b312656559b48468270a76446f51f7f24aac1a1`, bridge `sha256:c4267e0a33139a2c56d3c58db5ae28b8197942a84506e41d8f47de50d305629c`, backend `sha256:7058a8d87d7b7f2b9037e5ec04065b734f7225d9e135f62a6d9cbf6d7e7d90ab`. Four actual invocation controls and the second isolation invocation passed. The first isolation invocation failed because Docker was absent from the sanitized PATH. These are diagnostic controls, not canonical execution. Later source edits invalidate any claim that those build-input snapshots represent this final working tree; rebuild with captured current inputs and actual implementation-commit provenance before admission.

Latest applied-code checks: full pnpm test passed (989 Convex tests, 291 orchestration tests with one skipped, 188 workflow-engine tests, plus other workspaces); the subsequently added legacy-ingress tests passed in the eight-test focused run. Lint, build, docs, whitespace, default runtime-contract guard and authorization/secret checks passed. Authoritative codegen succeeded again against disposable loopback backend 3 after the ingress fixes. Preserve earlier missing-export, browser-type, codegen import and sandbox-socket failures separately; they are not PASS evidence. No final canonical browser, full release-security, CI or post-merge qualification is claimed.

Automatic approval review rejected the proposed persistent Factory readiness/activation and WorkOrder admission/dispatch edits, stating that allowing isolated execution without the existing inference-route and governed-MCP gates would create a persistent admission bypass beyond the narrowly approved offline scope. Those rejected edits were not applied or routed through an alternative tool. The stricter data-only exact-profile binding was accepted; it does not open these gates.

Concrete remaining blocked scope: `convex/factory/configuration.ts` readiness and activation must validate the full current offline profile, explicit inference denial and zero tool authority; `convex/workOrders.ts` must freeze the approved deterministic workflow through the existing Task/Attempt constructor and reserve resource budget transactionally, while rejecting model overrides and preserving Plan, human approval, repository, lease, verification and publication gates. This is source implementation and disposable synthetic qualification only, not permission to activate or deploy production. No rejected change may be retried without resolving the approval boundary.

Further engineering limitations remain even after that boundary is resolved: Docker CLI hashing followed by pathname execution leaves a replacement window; evidence delivery has no durable replay across transport failure/restart; real canonical claim/startup integration and browser lifecycle proof remain outstanding. Do not claim trusted measured-result ingestion or behavioral PASS from these fixtures. No commit, push, merge, production deployment or external model call occurred. Mission Control PR165 remains Draft/NO-GO for promotion; FDLC and Guide PR11 remain unpromoted, with no new independent promotion recommendation established by this checkpoint.
