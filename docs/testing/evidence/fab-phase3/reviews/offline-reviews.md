# Fab Phase 3 offline reviews

Scope: MC branch `codex/fab-phase3`, implementation `e8d9b45eca503ec56d29efeec87d37c9e86e5c59` with subsequent documentation/test/UI-identifier corrections through `ac8e38c`; Fab runtime source `1d1240c219d9bf3c1fa5fbb0a80ded96cf13df1f`. These reviews do not qualify paid provider execution, deployed Convex persistence, controlled GitHub publication or hostile whole-agent containment.

## Independent security review — GO for inspected offline scope

A separate read-only reviewer inspected provider enrollment, credential selection, receipt redaction, unknown outcomes, MC runtime pins, verification/currentness, human review, publication and workspace recovery. The reviewer independently hashed the private archive and 41 installed files and confirmed the lockfile, source and runtime pin match. No live requests, credential reads or unrelated Keychain inspection occurred.

Findings were resolved before this clearance: frozen-source overwrite on candidate reports; stale publication ownership after interrupted transfer; missing event allowlist entries; loss of original verifier identity during human resolution; uncertain publication replay after expiry; a write-boundary expiry/lease race; and classification of authority rejection as retryable infrastructure failure. The worker now fences provider writes after asynchronous preparation and inside the transport helpers. Rejected verification authority produces canonical blocking evidence without preparing dependencies or executing candidate commands.

The reviewer inspected the 236-pass combined test log. A prior coverage-gap note was withdrawn after confirming that the real-Git worker test exercises authority rejection and asserts skipped preparation/command invocation, terminal COMPLETED and BLOCKED evidence. The reviewer did not rerun the tests. Live/deployed integration and whole-agent containment remain separate gates.

## Data integrity review — GO for inspected offline scope

Reviewed additive schema validators, currentness projection, candidate/report transactions, separate verifier scheduling, human receipt resolution and immutable publication binding. Existing v1 subject fields and digest namespace remain readable; no backfill, delete, historical reinterpretation or table replacement is introduced. New fields are optional for historical records. The runtime contract advances to v42 because old clients must not assume the new recovery API or lifecycle states.

Candidate capture validates frozen WorkOrder revision, contract, internal/provider repository, base, head, tree, raw diff and persisted artifacts in the same Convex mutation as pausing the source. Failed validations roll back the packet. Scheduling is a separate action/mutation boundary so dispatch failure leaves a durable candidate and a recoverable blocker. Canonical currentness selects the latest source and verifier before verdict; newer failure cannot fall back to an older pass.

Human resolution preserves the separate verifier's identity and ties the resolved receipt to the server-held approval and continuation. Publication records a separate immutable subject-to-permit-to-human-to-PR binding. Current trusted PR/head evidence remains necessary for acceptance. Historical checkpoint leases and protected local ownership history are not accepted as active authority.

Actual mutation regressions cover frozen-base substitution, packet rollback, candidate pause, verifier failure/blocking, infrastructure retry, event persistence and uncertain publication. Deployment still requires schema/client coordination and real persistence qualification. A downgrade to a schema that does not recognize v2 subjects is unsafe after v2 records exist; preserve the additive readers or drain/disable new dispatch before an operator-managed rollback. No production migration or rollback was performed.

## Architecture review — GO for inspected offline scope

The dependency direction remains FDLC Fab package → generic MC adapter/runtime context → canonical MC orchestration and Convex authority. Fab receives no approval, publication or merge API. The shared workflow engine owns pure subject/currentness decisions; Convex owns persistence and authorization; the worker owns execution and provider transport. UI recovery invokes the same permission-checked mutations used by the canonical lifecycle.

The v2 subject and separate publication binding close the prior PR-before-verification cycle without adding a second approval service, lease loop or database. Existing Execution Profiles, exact model-route/runtime admission, verifier Factory, human continuation and publication permit remain authoritative. Package changes are consumed through one immutable archive, not a copied runtime source tree.

The cross-layer change spans runtime, schema, domain helpers, worker, tests and one operator panel because each carries the same lifecycle identity. This is intentional scope. Whole-agent remote Fab execution, hosted multi-user Fab, streaming, model fallback and autonomous merge remain deferred rather than represented by placeholder APIs.

## Simplicity review — GO; no broad refactor required

The recovery panel is a focused component with observable pending/error/success states. Pre-publication and acceptance share one currentness evaluator with an explicit purpose. Legacy subject aliases preserve existing callers. Repeated publication checks are necessary temporal fences around asynchronous work, not redundant validation. Protected owner history is bounded and serves the observed lost-ack recovery case.

The existing worker remains large, but splitting its whole lifecycle during this qualification would add unrelated risk. Keep the current bounded helpers and explicit transitions. No speculative framework, new service or generic recovery abstraction is required for this scope.

## Current-main reconciliation

Main advanced to `f90c50f5b4191467b2117bb8762754f697b1cefd`; merge `1401a4e` preserves its governed MCP changes and legacy v1 LOCAL_GIT candidate attestation, which remains acceptance-ineligible. Fab uses the distinct v2 subject with raw diff/base and publication binding. Runtime compatibility advances to v43; historical subject namespaces/receipts are unchanged. The full reconciled System Qualification passed.

Follow-up review found unsupported legacy providers lacked explicit rejection in the pure helper (Convex already restricted the enum), and cross-Attempt recovery could strand ownership during rename/write or a lost acknowledgment. Commit `f698b7c` adds kind/provider rejection, non-GitHub deny-default currentness and atomic complete-destination transfer with protected original-owner/candidate receipt. Four persisted interruption states exercise before-write failure, duplicate source after destination commit, legacy rename window and lost acknowledgment; stale/foreign owners and candidate mismatch are denied. This test is fault injection over real local Git, not a live deployment or actual SIGKILL claim.

Final follow-up security review is **GO for the inspected offline recovery delta**, with no remaining concrete findings. The canonical claim mutation validates the exact failed source, unchanged manifest apart from recovery causation, immutable candidate, current admission and unpublished read-only recovery before allowing a lost-lease reclaim. Ordinary executor replay still requires a replacement Attempt. The public recovery mutation rejects existing FAILED/CANCELED records without rewriting terminal history. The reviewer inspected the four changed Convex files and the 22-pass actual-mutation log; it did not rerun tests or establish live/deployed qualification.

The main-thread data-integrity/architecture/simplicity follow-up confirms that this guard reuses the existing lease and protected workspace ownership records. It creates no new execution authority or alternative publication path. Final clean-checkout System Qualification passes all 19 gates at `f5ed5d10ac58ba4472eddd882a06406fd96d9830`, with a standard frozen install, exact installed-runtime verification and 15 passing browser tests. See [clean validation](../../fab-phase3-clean-final/clean-validation.json).
