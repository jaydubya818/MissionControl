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

The current canonical Docker admission contract still rejects the new profile
key and memory size. Its local-only admission and promotion need a reviewed
change and scope-bound evidence before any real dispatch. This implementation
does not weaken that gate or register synthetic fixture records.

## Result reporting

Docker exit and reported bundle status now distinguish SUCCESS, WORKLOAD_FAILURE,
CANCELED and TIMEOUT. Prior cancellation, deadline, fencing and policy states
take precedence over a late successful result. Malformed status reports are
INVALID_REQUEST. SUCCESS is diagnostic only. RemoteSandboxRuntime continues to
validate the complete result against the frozen Attempt and acceptance criteria.

## Price and budget review

Reviewed October 9. Anthropic lists Sonnet 4.6 standard input/output rates of
$3/$15 per million tokens and a 10% regional premium for Bedrock. This implies
$3.30/$16.50 for the proposed US route. This is a derived candidate rate, not a
new approved price record. The AWS page retrieved for this review did not expose
the exact model's dynamic rate row. See [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
and [AWS pricing](https://aws.amazon.com/bedrock/pricing/).

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
