---
date: 2026-08-11
topic: governed-staging-release-verification
---

# Governed Staging Release and Verification

## What We're Building

Mission Control will extend the verified WorkOrder path beyond a review-ready
pull request. A new factory-release record will bind one exact WorkOrder,
Attempt, repository, pull request, PR head, GitHub-reported merge commit, and
staging environment. A human with delivery-approval authority must approve that
exact merge commit before a staging deployment receipt can be recorded.

After deployment, Mission Control will independently check provenance, smoke,
and health endpoints. Only passing evidence for the exact merge commit may move
the release from `DEPLOYED` to `VERIFIED`. A rollback records the restored
commit and provider evidence and ends in `ROLLED_BACK`.

## Why This Approach

### Recommended: separate factory release plus provider-neutral evidence

Keep code releases separate from the existing agent-template `deployments`
table. GitHub remains authoritative for merge identity; the delivery operator
provides the staging deployment receipt; a server action performs independent
HTTP verification. This is the smallest enforceable slice that works with any
staging provider and does not grant Mission Control deployment credentials.

### Rejected: extend the existing `deployments` table

That table deploys `agentVersions` for `agentTemplates`, requires those foreign
keys, and currently treats release gates as shadow-only. Reusing it would mix
two lifecycles and make the code-release authority ambiguous.

### Deferred: direct Vercel or provider deployment

A vendor adapter could deploy after approval, but it adds credentials, provider
API semantics, cancellation, and remote rollback before the core authority and
evidence model is proven. The provider-neutral receipt boundary keeps that
future adapter additive.

## Key Decisions

- GitHub provider evidence owns `mergeCommitSha`; browser-supplied merge SHAs do
  not create a release.
- V1 supports `staging` only. Production and broad rollout are rejected.
- Release state is exactly `MERGED → DEPLOYED → VERIFIED` or
  `DEPLOYED/VERIFIED → ROLLED_BACK`; approval is a separate immutable gate and
  does not masquerade as deployment.
- Deployment approval binds the release ID, environment, and exact merge SHA.
- Deployment evidence includes provider, provider deployment ID, deployment
  URL, provenance URL, smoke URL, and health URL.
- Verification fetches same-origin HTTPS endpoints, records status, latency,
  and content digests, and never persists response bodies or credentials.
- Provenance must name the exact merge SHA and provider deployment ID. Smoke
  and health must return a successful HTTP status.
- Verification failure keeps the release `DEPLOYED`, exposes the failed check,
  and recommends rollback; it never reports green optimistically.
- Rollback requires explicit delivery approval plus the restored commit and a
  provider receipt/evidence reference.
- The existing agent-template deployment board remains available below the new
  factory-release section until a later product consolidation decision.

## Open Questions

- The first direct deployment provider adapter is intentionally undecided. It
  should be selected only after this staging evidence contract is proven.
- Production activation, canaries, health windows, and automatic rollback are
  explicitly outside this slice.

## Next Steps

Implement `docs/plans/2026-08-11-feat-governed-staging-release-verification-plan.md`.
