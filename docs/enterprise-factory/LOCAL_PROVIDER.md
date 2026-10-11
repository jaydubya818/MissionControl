# MissionControl local provider engineering qualification

The accepted Checkpoint 1C remains BLOCKED/PARTIAL at `eeafbcc5a33208191081ddc05ca49755f4b7bb18`. Its guard, evidence and Bedrock baseline are preserved. Checkpoint 1B remains `23e0306e29e970efc31f614304f2abcdd071fbac`; no historical qualification is rewritten.

This isolated branch pins an **engineering-only** MyFactory source, `e498c31db8b749fa91b0544ecd1d1a661b971c2c`. The four prior dependency pins and production compatibility constants are unchanged. This new qualification pin is deliberately separate from `MYFACTORY_COMPATIBILITY_SHA`; it cannot enable production admission.

## Implemented journey

An authenticated owner approves the exact Plan/delegation and frozen verification specification in a disposable fixture database. MissionControl reuses Factory Definitions/Versions, Mission, WorkOrder/revision, current Attempt/lease, delegation binding and existing allowance projection. It checks owner/tenant, active WorkOrder/current Attempt, approved Plan, revision, registration, FactoryVersion, candidate/model/harness/effect/budget/deadline policies and revocation before send and throughout execution.

One transactional claim permits authenticated MyFactory admission. A lost acknowledgment retains UNKNOWN and its allowance; restart reads the existing admission and does not send another. MyFactory uses its existing PostgreSQL lifecycle and Work ledger, the explicit Docker provider, an actual deterministic producer, validated Git candidate custody, a separate immutable verifier allocation and signed V3 execution provenance within the existing Result protocol. No mocked Result substitutes for execution.

MissionControl verifies signature/artifact bytes and exact source/provider/request/candidate/verifier binding before internal evidence ingestion. The approved Plan Quality Contract is compiled with the canonical compiler. The canonical VerificationEngine evaluates required independent evidence plus verification authority, change-budget and negative-constraint system checks. The decision is **SHADOW / AWAITING_HUMAN**. It grants neither acceptance nor publication. Contract fields cannot be removed after approval.

The fixture budget is bound to its authenticated Mission owner at initialization. Its persisted owner survives Plan replacement/removal; peers cannot initialize first, read the allowance or reserve against it. Historical fixture budgets without an owner fail closed and require disposable-fixture reseeding.

Evidence, shadow decision and zero-cost settlement are committed atomically and duplicate-safe. Failed/cancelled or late completed Results have a separate accounting-only reconciliation path. Proven cleanup may release a held allowance after cancellation, expiry, revocation or supersession; that path cannot reauthorize execution or advance a quality gate.

## Qualified scope and remaining boundary

This qualifies deterministic engineering on the observed trusted Docker host. The Factory host/daemon/database/signing key remain trusted; Docker is not represented as Vercel Sandbox or a VM boundary. MyFactory rejects paid reservations. The source fixture, model and harness are fixed. Arbitrary repositories, private-source credentials and paid inference are unsupported here.

The existing enterprise fixture allowance projection is exercised with native/delegated contention, UNKNOWN retention and exactly-once zero settlement. It is not production shared-accounting adoption. The shadow verification engine is not canonical policy-v2 currentness or enterprise acceptance adoption. Recovery tests retain canonical durable records and explicitly invoke readback/reconciliation; an autonomous production recovery service is not qualified.

Production adoption recommendation: **NO**. The next production decision must independently qualify shared accounting, policy-v2 gate/currentness, service recovery, deployment configuration and compatibility migration. No production pin, executable grant, external-alpha release or deployment is changed by this checkpoint.

## Evidence and regressions

The composed database script qualifies 13 groups, including five actual terminal journeys (success, cancellation, execution failure, late completion and expiry). MyFactory separately qualifies 14 provider groups.

MyFactory hosted qualification passed on the exact engineering source: [run 37995545524](https://github.com/jaydubya818/MyFactory/actions/runs/37995545524). It runs actual Linux Docker/PostgreSQL, 14 qualification groups, existing Vercel/Result regressions and producer typechecking. The prior hosted attempt failed provisioning PostgreSQL through Docker Hub; the public mirror corrected that infrastructure failure without changing runtime code.

Local affected suites: 27 MyFactory protocol/lifecycle/custody tests; 213 shared MissionControl tests; 87 native regressions; 26 adapter contracts; workspace and Convex typechecks; authorization and repository disclosure checks. The full MyFactory workspace suite was also attempted but is not claimed green: sandbox loopback/browser prerequisites and expired pricing fixtures prevented qualification. The cloud-harness pricing failure was independently reproduced at the exact prior compatibility source.

The affected Bedrock suite preserves 89 total / 47 passing / 42 failing with failure-set identity `9127e6d1cfb66cd6bc74e1887249e7122405d429820652f57d3247d418b10350`. Status remains `BASELINE_UNCHANGED_NOT_GREEN`, introduced failures 0, resolved 0, changed reasons 0. The baseline remains `CHECKPOINT_1C_BEDROCK_BASELINE.json`.

Independent security and architecture reviews found and closed stale-Attempt admission, unsuccessful terminal proof, reconciliation/live-authority coupling, verifier-owned mutable candidate files, unhashed control assembly and insufficient host-report validation, deadline process protection and durable budget ownership. Final exact-source composed/fresh-clone/CI results accompany this checkpoint; earlier working-tree runs and one loaded-host Convex timeout are retained as earlier evidence, not substituted for final qualification.

## Reproduce

Use a clean checkout of the exact engineering MyFactory source, fetch its public source fixture, provision its exact public Node image and PostgreSQL 17, and set a disposable local Convex binary. Run:

```sh
MC_LOCAL_MYFACTORY_ROOT=/absolute/path/to/exact/myfactory \
MYFACTORY_FIXTURE_GIT=/absolute/path/to/source.git \
MC_COMPATIBILITY_CONVEX_BINARY=/absolute/path/to/convex-local-backend \
node --import tsx scripts/enterprise-compatibility/local-provider.mjs
```

The script requires the exact clean MyFactory checkout. The new hosted workflow repeats both the prior pinned compatibility checkpoint and the composed local journey. Fixture seed/fault/inspection functions are copied only into the disposable backend; they are not production Convex functions.

Rollback: preserve production pins, disable `MC_ENTERPRISE_COMPATIBILITY_FIXTURES`, and retain signed historical evidence. Never replay UNKNOWN Work to recover a missing acknowledgment. Reconcile the original resource and settle only authenticated cleanup/accounting evidence.
