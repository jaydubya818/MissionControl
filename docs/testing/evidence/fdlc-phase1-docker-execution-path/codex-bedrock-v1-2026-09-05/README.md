# codex/bedrock-v1 offline qualification

Status: **OFFLINE_QUALIFICATION_PASS**. AWS identity and real-call holds remain. This
folder supplements, and does not replace, the 212 focused / 51 Docker-ledger /
19 System historical baseline. The final current-main System run passed all 19 gates.

The new harness uses existing Attempt, Execution Profile, Factory Version,
reservation and settlement authority. It changes the provider protocol and Docker
bootstrap as separate versioned identities. `codex/v1` remains unchanged in meaning.

## Evidence boundaries

- A disposable repository and synthetic Bedrock responses exercise actual Codex CLI
  0.146.0 in Docker, including command-tool use and final patch/result collection.
- The host provider factory derives its binding from the worker claim. Tests use
  signed service-command fixtures; separate tests execute actual Convex handlers.
- No fixture is represented as a real producing Attempt, candidate, admission,
  AWS identity, pricing record, profile qualification, or Factory Version.
- SDK tests supply a fake client and synthetic temporary credential envelope.
  They prove client options and invocation boundaries, not live provider behavior.
- Full workflow-engine and independent-verifier regressions remain required.

## Resumption contract

The [safe bootstrap template](../../../../software-factory/fdlc-aws-bootstrap-handoff.json), checker and plan-only resumption command accept the
approved identifiers without source edits. Do not run STS or Bedrock until separately
authorized. Verify account and principal, exact US profile and destination model
set, independently applicable pricing, then register/qualify the canonical route
and profile. Any bounded model call requires separate explicit authorization.

Later governed worker configuration uses `CODEX_BEDROCK_HARNESS_ENABLED=1` and an
explicit `CODEX_BEDROCK_APPROVED_CONFIG_FILE`. Startup also requires canonical
`CODEX_WORKER_PROJECT_ID` and `CODEX_WORKER_REPOSITORY_ID`, matching the eventual
Attempt and reservation scope. The configuration contains route, reservationId,
priceDigest, maximumOutputTokens (at most 4096), timeoutMs (at most 900000), and
`callAuthorization`. It is not supplied or enabled for this qualification.

The authorization descriptor uses schema
`fdlc-bounded-bedrock-call-authorization/v1`, approvalReference, routeDigest,
expectedStsPrincipalArn, identityEvidenceDigest, profileEvidenceDigest,
credentialsFile, validUntil, and allowModelCalls=true. An approved provisioner must
place the temporary credential envelope at that explicit location. Its fields are
awsAccountId, roleArn, principalArn, accessKeyId, secretAccessKey, sessionToken and
expiresAt. This is a future credential-source contract, not permission to discover
or read any current local credential. Safe handoff files contain locations/identifiers,
not those secrets. The SDK has maxAttempts=1 and a fixed us-east-1 endpoint.

Run these from the isolated repository root with the explicitly supplied safe file:

```sh
node scripts/check-fdlc-bedrock-prerequisites.mjs --config /absolute/approved-safe-config.json
node --import tsx scripts/fdlc-bedrock-resumption.mts --config /absolute/approved-safe-config.json
```

Both commands are offline. Completeness does not verify AWS identity or authorize a
model call. Current template fields remain null; do not fill them from discovery.

## Containment, incident and rollback

The container has no network egress or credentials; the host bridge admits each
request through the canonical reservation mutation immediately before transmission.
An expired/mismatched lease, route, profile, price or balance prevents transmission.
UNKNOWN retains maximum liability across restart and blocks replay. Cancel fences
new sends and aborts the local transport; provider cancellation is never presumed.

On incident, cancel the canonical Attempt and preserve all reservation/usage/evidence
records. Exact-label Docker teardown verifies resource absence. Recovery selects
provider and immutable image together, without acquiring inference authority. Do
not release UNKNOWN liability or replay until the existing reconciliation authority
resolves evidence. Operator/Incident Commander remains Jarrett West.

Rollback disables the Bedrock worker configuration, stops/reconciles only its owned
containers, and returns future routing to the previously approved configuration
through the existing approval gates. Do not mutate or relabel codex/v1, the old image,
settled receipts or frozen profiles. No fallback provider or automatic route change
is part of rollback. Preserve candidate/evidence records; do not publish or merge.


## Final validation

- **19/19 current System gates PASS**, base main `6d7146d`; includes complete
  repository tests, contract/security/docs/lint/typecheck/build and startup smoke.
  [Machine-readable results](system-19-pass.json).
- **448 orchestration tests PASS** in the explicit Docker-enabled full run, including
  actual CLI, legacy worker cancellation/deadline/crash recovery and ledger controls.
  One separately gated shared-Convex integration test is excluded; it is not an
  offline fixture and no shared deployment was selected. Docker tests skipped in
  the general System run were executed in this explicit Docker run.
- **1,052 Convex tests PASS**, **178 workflow-engine PASS**, **39 model-router PASS**,
  **47 prerequisite/resumption PASS**. Existing independent-verifier tests pass.
- Subsequent test-only refinements: **27 worker fixture lifecycle tests PASS** and
  **5 Factory/profile composition tests PASS** (one additional configuration case).
  The final System run includes those refinements. No assertion was removed.
- **Both runtime guards PASS**: v42→v43, seven additions, one changed existing
  mutation, zero removals. Authoritative codegen succeeded against a disposable
  loopback backend; generated API diff includes the new internal modules.
- Architecture/security/data-integrity/simplicity/documentation reviews complete.
  [Review dispositions](independent-reviews.md).
- Both qualification provider container sets are empty. No AWS credentials were
  read; no AWS/real model/WO1 call, readiness, push, merge or publication occurred.

Earlier failed runs are retained in their separate run directories. Failures exposed
fixture container-name collision, one-second asynchronous fixture races and a missing
ESM import suffix; each was corrected and requalified. Original historical evidence
was not replaced. The final source includes current-main Phase 4 MCP closure and
its Phase 5 plan; the older pilot matrix is labeled as historical scope.

## Local commit closure

Direct chat authorization superseded the earlier automatic-review refusal. Reviewed
implementation, reconciliation, tests and evidence are locally committed as
`cb373ee36d1645cad4f277f59c75cb7b1cac57f5`. The follow-up evidence commit changes only documentation,
todo status and qualification receipts. Its identity is resolved with
`git log -1 --format=%H -- docs/testing/evidence/fdlc-phase1-docker-execution-path/codex-bedrock-v1-2026-09-05/local-commit/commit-record.json`;
a commit cannot contain its own hash. The final response reports both exact SHAs.

The original 19/19 System qualification remains bound to the recorded main baseline
`6d7146d5205aef729aee2960aed2a4ed8e8ab95c`. Qualified source-file hashes match the
implementation commit exactly. Commit-sensitive receipts and guards were rerun
against that implementation; [local commit evidence](local-commit/commit-record.json)
records results and content-based carry-forward of unaffected tests. The original
precommit records remain historical evidence, not claims about a different HEAD.

During closure the shared `origin/main` reference was observed at
`e9d2f52720e634b79d2c614a7fb9812a6b986fe9`, runtime v45. The unpinned guard correctly
rejects this v43 candidate against that newer baseline. Its failure is retained in
`local-commit/runtime-moving-origin-main.log`. Explicit and environment-pinned guards
use the reviewed immutable 6d7146d baseline; no guard implementation was changed.
This local candidate is not reconciled with the later v45 main. Importing its 163
changed files is outside the authorization to commit only the reviewed changes.
Future integration must reconcile those contracts and requalify; merely incrementing
a version would conceal removed interfaces and is not acceptable.

External boundary remains **QUALIFICATION_AWS_IDENTITY_REQUIRED**. Separately,
newer-main integration is unqualified. Neither statement grants readiness, live
identity access, model calls, WO1, push, PR creation, merge or publication.
