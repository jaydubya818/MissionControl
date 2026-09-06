# Reconciliation reviews — 2026-09-05

Review method: primary implementation agent source review plus deterministic tests.
These are not independent verifier attestations. No live qualification is issued.

## Security — GO for retaining the offline candidate under hold

Reviewed Bedrock route schema, canonical binding, fixture transport, bootstrap parser,
liability mutation authority and Docker ownership/recovery. Global and non-US profile
substitution, account/role/profile mismatches and stale worker authority remain denied.
Configuration is supplied explicitly; the checker and plan generator do not inspect
credentials, environment profiles, cached sessions or AWS. The fixture adapter rejects
non-fixture transports. The host does not gain live model authority from this work.
Docker labels bind Attempt/lease/generation/manifest before attach, stop or removal;
unknown allocation outcomes remain blocked and recovery never assumes absence.
Negative evidence: 77 Bedrock/composition, 47 checker/resumption, 88 core/recovery/profile,
51 Docker/ledger tests. Real credential isolation and an end-to-end broker bypass test
remain unqualified until a compatible harness composition is approved and implemented.

## Data integrity — GO for offline reconciliation; live composition unqualified

Found and fixed a real join mismatch: Bedrock fixture price provider AWS-Bedrock did
not equal canonical route provider aws-bedrock. Both the fixture price and budget
adapter now use canonical aws-bedrock, with a regression test. Historical price
evidence was retained; no registered price or live reservation was migrated.

The full Bedrock descriptor hashes into canonical V2 providerRoute and routeDigest;
account, environment, IAM role, source region and profile changes alter that binding.
The Execution Profile remains the authority for harness/runtime composition. Price
versions, reservations and usage events have distinct roles; main's routing cost
coverage is diagnostic, not a competing spend balance. One reservation per WorkOrder
and transactional read/write reservation enforcement survive. Request digest, Attempt,
lease, generation, receipt revision and correction evidence remain bound; unknown
liability and original maxima remain held after settlement. Duplicate detection is
reservation-scoped, not a claim of global billing reconciliation across accounts.
Account-specific prices, actual invoice attribution and real cohort allocation remain
unqualified. No synthetic fixture identity was inserted as an approved account.

## Architecture — BLOCKED: owner decision required

Newer main remains authoritative for exact routes, Execution Profiles, governed MCP,
Attempt candidate recovery, LOCAL_GIT verification, Factory configuration and readiness.
No alternate router, budget authority, Attempt state or verifier authority was added.
Docker remains the backend and Bedrock serialization remains a provider adapter.

However codex/v1 is immutable, advertises only OpenAI and pins Responses/OpenRouter.
The exact Bedrock Execution Profile is rejected as model-route-unsupported. A negative
test proves that fail-closed behavior; it does not prove a usable producing profile.
The existing route/profile and verification digest structures compose offline, but
full Docker/Bedrock producing/verifier/Factory compatibility cannot be claimed.
See fdlc-bedrock-harness-reconciliation-decision.md. Approval and implementation of
that versioned bridge are necessary before AWS identity can become the only blocker.

## Simplicity — GO for current bounded diff

Reused current exactModelRouteSnapshot/exactModelRouteDigest, executionProfileSnapshot,
Factory configuration digest and readiness summarizer. Did not edit the historical
codex/v1 manifest to advertise unsupported features. No equivalent main monetary table
superseded the Phase 1 reservation journal. Historical v41 qualification override is
scoped only to its child guard, while normal qualification uses current merge-base.
Current main's Context7 and candidate recovery APIs remain intact; seven required
Phase 1 additions are the only new public operations. No public operations removed.

## New main advancement reviewed

Main advanced from ed77c46 to eb438f5 during this task. Its ten changed files are a
source/evidence map, historical evidence and Vercel main-branch deployment guard.
PRESERVE_MAIN for all ten; SEMANTIC_MERGE additionally for the maturity ledger, where
both the operating-contract section and Phase 1 hold are retained. No runtime/schema
change; current main remains v42 and candidate remains v43. Local rebase preserved
this commit unchanged. No remote push, merge or deployment was performed.


## Verification follow-ups

Committing previously untracked historical evidence made the secret scanner inspect
an older ephemeral-backend probe for the first time. It misread the expression
CONVEX_DEPLOY_KEY: key followed by punctuation as a long literal. Source inspection
confirmed the key is generated for the disposable backend and that property is
immediately deleted before use. Added the scanner's existing allow-fixture annotation
on that one line; original bytes and SHA-256 remain in the adjacent original archive.
The scanner itself and its rules were not relaxed. A prior failed run also exposed
its inability to lstat unstaged deleted patch files; staging the lossless archive
conversion fixed that inventory condition. Both failures remain in evidence.

Browser inspection covers the actual pure readiness React component in an isolated
fixture: loading, explicit blockers, expiry and refresh callback. Mobile text wraps
without clipping. This is component behavior evidence, not a production-app layout
or real Convex readiness query qualification.
