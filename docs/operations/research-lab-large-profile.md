# Local Research Lab large-repository candidate

The local capacity test and post-fix full-tree test pass. This is a selectable
worker composition candidate, not an admitted live execution profile. No
canonical profile, price, reservation, Attempt, or worker has been activated.

## Selection

Set `BedrockFactoryConfiguration.localResearchLabProfile` to
`large-repository/v1` when constructing `bedrockFactoryProviderFactory`. The
Convex client URL must be exactly `http://127.0.0.1:3214` or
`http://localhost:3214`. Select provider profile
`factory/docker-bedrock-research-lab/v1` with 1 CPU and 2048 MiB RAM, the pinned
`RESEARCH_LAB_DOCKER_IDENTITY`, and all existing containment requirements.

The immutable capacity selection is `research-lab-large/v1`: 256 MiB input,
1 GiB workspace and 2 GiB RAM. It requires the governed Bedrock bridge.
Omitting the selection retains the standard limits and image. Selecting the
larger profile at another backend or substituting its image is rejected. This
URL check constrains composition; it does not authenticate the backend or grant
canonical admission.

Commit `69fbe37` adds canonical validation for this local profile and was applied
to the verified Research Lab backend after export. Registration, promotion and
eligibility require exact server-owned cloud/site URLs, project, tenant, image
and an evidence scope valid for at most 24 hours. Production and publication
remain denied. No profile record has been registered or promoted; real dispatch
still requires scope-bound evidence and operator approval.

## Result reporting

Docker exit and reported bundle status now distinguish SUCCESS, WORKLOAD_FAILURE,
CANCELED and TIMEOUT. Prior cancellation, deadline, fencing and policy states
take precedence over a late successful result. Malformed status reports are
INVALID_REQUEST. SUCCESS is diagnostic only. RemoteSandboxRuntime continues to
validate the complete result against the frozen Attempt and acceptance criteria.

## Price and budget review

Reviewed October 9. The rendered [AWS pricing table](https://aws.amazon.com/bedrock/pricing/)
confirms Sonnet 4.6 at $3.30/$16.50 per million input/output tokens in the Geo
and In-region Cross-region Inference section, selected US East (N. Virginia).
This confirms the earlier derived candidate rates; it does not activate a new
approved price record. See the retained pricing observation.

The [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html)
now lists CountTokens support. Existing exact-route evidence says UNSUPPORTED.
Requalify that capability on the exact US route before changing accounting.
Do not assume the model-level documentation proves a particular route works.

Under the existing full-context reserve, each request requires $3.367584 for
1,000,000 input tokens and at most 4,096 output tokens. A four-request producer
proposal therefore reserves $13.48 (calculated maximum $13.470336), with zero
retries, no fallback, cache or reasoning changes, and a separate verifier gate.
Four requests may still fail to produce a candidate. Independent verification
and any additional model calls require their own approved scope and budget.

The prior $4.49 remains reserved. The existing $5 program does not have enough
unencumbered authority for even one conservatively reserved request. The draft
requires new explicit budget authority, not a transfer or release of that hold.
This is a review package, not a request to activate an incompletely admitted
profile. Resolve canonical local admission and exact-route price/capability
evidence first, then request a fresh activation decision.

See [tests, result and draft configuration](../testing/evidence/terminal-profile-2026-10-09/README.md).

## Local admission qualification

The implementation passed 1,501 Convex tests, 813 orchestration tests and both
typechecks. Four opt-in full-repository Docker lifecycle cases passed with
synthetic responses: success, failure, cancellation and timeout. All containers
were confirmed absent after cleanup. See [current evidence and remaining gates](../testing/evidence/local-admission-2026-10-09/README.md).

Exact AWS route verification is blocked by the approved profile's expired SSO
session. Restore `fdlc-qualification` authentication and run the guarded read-only
check before changing CountTokens or price qualification. Full live producer,
independent verification, billing reconciliation and broader approval remain
incomplete. The old reservation, failure and credential revocation are preserved.
