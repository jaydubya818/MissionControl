# Selected classification transport: bounded dispatch contract

Todo 063 continuation after canonical inference identities. Offline implementation
only; the selected service and its live-authorization boundary remain unchanged.
Reuse the existing inferenceReservations ledger. A WorkOrder with the provider
aggregate reservation must use its composed path; reciprocal exclusion prevents
an independent second balance.

## Bounded behavior

- Freeze one text-only, nonstreaming Chat Completions wire request for the pinned
  `gpt-4o-mini-2024-07-18` route before admission. Accept one user message,
  optional temperature and the supported output cap. Reject extra fields.
  Final bytes bind the model, `n: 1`, `stream: false`, default tier and
  `max_completion_tokens` between 1 and 1024. Output cap and temperature,
  including its absence, must match the qualified route snapshot exactly;
  unsupported reasoning parameters are denied.
- The selected claim requires the existing frozen reservation to cover 128,000
  input tokens and 128,000 automatic cache-read tokens plus requested output.
  Separate cache coverage deliberately over-reserves the inclusive input bound.
  Forbidding request cache fields does not disable provider-managed caching.
  No cache-write or separate reasoning liability is admitted by this exact path.
- Revalidate the approved WorkOrder revision, current canonical Attempt,
  repository, Execution Profile and its live dependency graph, exact route,
  execution manifest, Factory Version/profile scope, lease and registered worker
  generation. Keep every WorkOrder allocation against both WorkOrder and Factory
  ceilings, including expired, cancelled and unknown outcomes.
- Require the exact immutable price-book digest, active state, finite effective
  interval and explicit default-tier rate. Recalculate frozen worst-case money
  using integer arithmetic before claiming. Old indefinite price books do not
  qualify for this dispatch contract. Their history is not rewritten.
- Persist a `classify-inference-dispatch/v1` allowance atomically with the unique
  physical claim. Bind database and logical identities, request digest and bytes,
  exact route, profile/price identity, input/cache/output/money bounds and time.
  Validity is at most 30 seconds and cannot outlive any admitted dependency.
  The digest checks integrity; only the trusted ledger issues send authority.
- Validate the returned allowance against the pending request and exact frozen
  wire. Recheck cancellation and expiry immediately before transmission; enforce
  the earlier authoritative deadline throughout fetch and bounded response read.
  Missing or ambiguous admission never permits send or retry.
- The selected path permits one physical call, with no implicit retry or fallback.
  Separate transport observation from receipt persistence. A persistence failure
  does not create an empty replacement receipt or trigger another provider call.
- With the gateway flag disabled, classification stays deterministic. The former
  direct SDK branch cannot bypass the governed provider boundary.

## Primary documentation and conservative bounds

The pinned model is listed with a 128,000-token context window. Reserving the full
context as input is conservative; it is not a tokenizer estimate. The selected
output stays at 1,024 tokens. [Model specification](https://developers.openai.com/api/docs/models/gpt-4o-mini).

The API defines `max_completion_tokens` as an output bound including reasoning
and charges choices separately. The request fixes one choice and rejects other
billable request options. [Request contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

## Qualification and remaining boundaries

Prove zero fetches for malformed/oversized input, absent or changed allowance,
revoked dependencies, changed WorkOrder revision, fenced worker, inadequate
budget, cancellation and expiry. Prove request immutability across awaits,
concurrent single-claim behavior, bounded response reads and persistence failure
without replay. Retain real local backend proof, independent reviews, composed
regression, exact PR-head checks and clean-main qualification.

This slice does not establish real account/project/geography enrollment, live
capability or price provenance, actual billing, general fallback, completed
settlement, complete usage normalization or observed-overrun retention. Those
remaining todo 063 requirements must close separately. No published model rate,
synthetic allowance or program source authorization supplies a live-provider
budget grant. Source remains Experimental and default off.
