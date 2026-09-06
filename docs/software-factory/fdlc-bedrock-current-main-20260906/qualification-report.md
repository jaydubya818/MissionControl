# Phase 1 Bedrock current-main qualification

Status: **OFFLINE_QUALIFICATION_PASS**. External dependency:
**QUALIFICATION_AWS_IDENTITY_REQUIRED**. No readiness or Phase 1 completion claim.

> **Current-tip closure — 2026-09-06:** The implementation landed through
> [PR #185](https://github.com/jaydubya818/MissionControl/pull/185) at merge SHA
> `9e6dfd9b0110c0316b1fc085539b41e2616ebac7`. Subsequent inference identity,
> Fab broker and finite dispatch changes advanced authoritative main to
> `8bf19fcb7e46f4b80a862054d22fbd7ca7ed436f`, runtime v49. Exact-tip CI passed
> every job, and the affected local qualification passed 582 tests with one
> separately gated shared-Convex integration skip. The AWS identity hold below
> remains current; Production deployment and WO1 are therefore not admissible.

## Source and authority

Authoritative baseline: `4434cc56448075f4804787325a9586c6290b2215`, runtime v46.
Candidate runtime v47: six public additions, one Docker profile argument expansion,
zero removals. Plan and overlap classifications were written before version changes.
The fresh branch is `codex/fdlc-bedrock-current-main-20260906`.

Historical implementation `cb373ee36d1645cad4f277f59c75cb7b1cac57f5` and evidence
`683b9f04f1a235a8c007057d73cbe03a9c72e846` remain untouched in their clean historical
worktree. They are implementation/evidence input, not the current baseline.

Current main's readiness (#183), cumulative inference allocations (#184), Fab,
exact runtime/route identities, shared intent, independent candidate verification,
publication intent and recovery remain authoritative. No net UI change remains.

The owning team is **FDLC / Mission Control**. **Jarrett West** is champion, Human
FDE / Operator and Incident Commander. These assignments combine no trust gates.
The authorized source PR/merge is distinct from publication of a pilot result.

## Invariants and evidence

- `codex/v1`: `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06` preserved.
- `codex/bedrock-v1`: `sha256:8c65005a0717a79d0fa8a7014a90e302ccdd0f9e5f474534cd08fe89f11cb17d` preserved separately.
- Docker image remains `mission-control/factory-docker-bedrock@sha256:11ea5f88493593ff48520222e1df3bca6303e92138847decf71d30e5cce92124`.
- Each host transmission requires current signed Attempt/lease/generation/profile/
  route/price authority, aggregate nano-USD hold and canonical physical inference
  reservation/claim in one transaction. Current main's cumulative allocation check
  applies to both public and composed reservation paths.
- UNKNOWN retains full liability and cannot replay. Actual overruns freeze spending
  and retain observed usage as append-only reconciliation. Receipt ownership spans
  both ledgers; correction identity includes receipt revision.
- Producer cannot certify itself. Independent verifier, human acceptance, publication,
  merge/release and rollback gates retain their existing distinct authority.

[Current evidence](../../testing/evidence/fdlc-bedrock-current-main-20260906/) contains
source hashes, authoritative loopback codegen, contract diff, exact identities,
independent reviews and explicit Docker results. The prior 19/19 System pass against
f749b06 is preserved separately; it is not reused as qualification of changed source.
All **19/19 current System gates passed**, exit 0. The full latest-main run is recorded under
[System evidence](../../testing/evidence/fdlc-bedrock-current-main-system-4434-20260906/automated-checks.json).

Focused validation: 113 accounting tests; 492 explicit orchestration/Docker tests
with one separately gated shared-Convex integration skip; 182 workflow-engine tests;
51 model-router tests; 58 worker/Fab composition tests. Full System includes current
repository tests, security, docs, lint/typecheck, build, runtime and startup smoke.
All model responses in these checks are synthetic.

The fresh local Fab installation required removing only a pnpm-generated package-local
bin shim so installed archive bytes match the existing pin. The pin/guard was not
changed. Current main's Corepack cache handling remains preserved. The Telegram
composite TypeScript project now includes the imported canonical inference module;
no product behavior was added there.

## AWS and remaining execution gates

The approved handoff/resumption records still have null account, project/environment,
role/config provenance, AWS_PROFILE, expected STS principal, profile ARN and approval
reference. Account 083665737366 from conversation is not bootstrap-confirmed and has
not been activated or hard-coded. A safe authoritative configuration location was
requested while engineering continued. No ambient AWS profile, credential, cached
session or unrelated account configuration was used.

Route remains AWS Bedrock, source us-east-1, underlying anthropic.claude-sonnet-4-6,
US profile us.anthropic.claude-sonnet-4-6, destinations exactly us-east-1/us-east-2/
us-west-2, global denied. Public model/pricing research is reference material only.
No real price, reservation, route, Execution Profile or Factory Version was issued.

Once authoritative configuration arrives: validate safe provenance, then perform only
explicitly authorized read-only caller identity/profile/topology inspection; qualify
account-specific price/effective terms and exact route. Any model call still requires
an exact existing or newly supplied bounded live-call authorization. Qualify producer
and verifier separately, freeze Factory Version, derive readiness, and use the canonical
WorkOrder path only when its execution authority is satisfied. No manual READY state.

WO1 remains unexecuted. Preserve its approved plan/budgets and exact controlled target;
no fixture supplies live acceptance. All ten-outcome and broader program completion
conditions remain open until attributable real pilot evidence exists.

## Containment and rollback

Keep Bedrock enablement/configuration disabled while qualification is incomplete. A
later incident must cancel the canonical Attempt, fence new sends, retain all unknown
liability and receipts, reconcile only exact labeled Docker resources, and verify
absence. Never replay an ambiguous request or substitute a provider/model/region.
Returning to a previously approved configuration uses the existing human gates; it
does not relabel either harness or release unknown exposure. No production activation
or deployment is authorized. Source landing does not grant live execution authority.

## Committed source and evidence binding

Implementation commit: `8b357d0e161fdf75f64e350d55fb31aed6f14cfa`. All 84 recorded source/test/config
file hashes match this commit and the final 19/19 System qualification input.
The eight commit-sensitive checks passed after committing: runtime against current
main and pinned baseline, authorization, MCP receipt, composed System scenarios,
golden eval, documentation and secret scan. See
[commit binding](../../testing/evidence/fdlc-bedrock-current-main-20260906/commit-binding/checks.json).
The containing evidence follow-up commit changes documentation/evidence only; its
identity is resolved from Git, avoiding a self-referential embedded commit hash.

## Current-tip reconciliation and qualification

The v47 Bedrock merge was followed by runtime v48 immutable inference-ledger
snapshots and runtime v49 finite classification-dispatch authority. Those changes
preserve the Bedrock harness manifests, Codex adapters, Bedrock Factory composition,
Bedrock inference bridge and Docker Bedrock identity byte-for-byte. They strengthen
the shared inference boundary without making classification dispatch an alternate
Bedrock authority.

Exact authoritative main `8bf19fcb7e46f4b80a862054d22fbd7ca7ed436f`
passed all GitHub CI jobs: typecheck, unit, lint, build, smoke, E2E, browser security
and accessibility, release security, eval integrity and System Qualification V2.
Local exact-tip validation passed 582 orchestration/Docker tests with one existing
shared-Convex integration skip. This includes the no-network bounded synthetic
Bedrock tool cycle, cancellation, timeout, startup and budget denial, cleanup
failure and worker-death recovery. Independent focused data-integrity validation
passed 166 tests; independent architecture validation passed 118 tests. Runtime
contract, repository secret scan (3,418 tracked files), documentation consistency
and whitespace checks passed. The exact-tip worktree was clean.

Independent architecture, security and data-integrity reviews returned GO. They
confirmed that `codex/bedrock-v1` remains a separate harness composition, direct
provider fallback is absent, dispatch requires finite current authority, aggregate
budgets and UNKNOWN/overrun handling remain fail-closed, and producer/verifier
separation is unchanged.

The approved bootstrap and resumption files were re-read on exact current main.
Account, profile, principal, project/environment, role, inference-profile ARN,
authoritative configuration location and approval reference remain null. Account
`083665737366` appears only in conversation and is not substituted for repository
authority. No AWS profile, credential, cache or session was inspected; no AWS or
model call occurred.

Production deployment is blocked before release, not merely untested: the exact
account route, authoritative price, liability reservation, producing and verifier
profiles, Factory Version, live-call proof and derived readiness do not exist yet.
Deploying now would violate the release prerequisites and could not produce a valid
Production acceptance or rollback proof. Resume by supplying the approved safe
handoff fields in `fdlc-aws-bootstrap-handoff.json` or an authoritative location
named by that record. Identity verification then precedes route/topology/pricing;
live-call authority remains a separate bounded gate.
