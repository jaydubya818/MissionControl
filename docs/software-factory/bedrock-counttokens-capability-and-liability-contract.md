# Bedrock CountTokens capability and pre-send liability contract

Status: approved qualification contract for the exact US geographic Sonnet 4.6
route. This contract does not authorize another model, provider, account, API,
streaming request, retry, fallback, Production use, or direct foundation-model
invocation.

## Capability fact

`us.anthropic.claude-sonnet-4-6` declares `CountTokens=UNSUPPORTED`. The retained
AWS response is a `ValidationException` stating that the model does not support
counting tokens. IAM authorization reached the service; the result is therefore
a provider capability fact, not an IAM failure. The immutable evidence is
[counttokens-capability.json](../testing/evidence/todo063-bedrock-counttokens-provisioning-2026-09-07/counttokens-capability.json).

The route contract supports three states:

- `SUPPORTED`: require the provider-returned exact count and bind it to the
  serialized request before reserving.
- `UNSUPPORTED`: use the qualified conservative upper bound below.
- `UNKNOWN`: deny before reservation or transport.

No local tokenizer result may be represented as provider-exact evidence.

## Conservative bound

The qualification profile admits at most 262,144 UTF-8 bytes and an explicit
1,000,000-token input ceiling. The strict serializer freezes one non-streaming
Converse body containing only `messages`, `system`, `toolConfig`, and
`inferenceConfig`. It records the exact UTF-8 byte length, rejects any mismatch
between the object and serialized bytes, and binds the output cap into the same
request digest.

Because CountTokens is unsupported and no exact compatible local tokenizer is
qualified, the pre-send input bound is the complete 1,000,000-token model
context ceiling for every admitted request. This deliberately ignores the much
smaller byte ceiling when calculating money. It cannot undercount: an accepted
request cannot incur more input tokens than the provider's model limit, while
any request the provider rejects incurs no successful-response input usage.
The 262,144-byte ceiling is a separate qualification-specific request control,
not a token-estimation formula.

## Price and maximum liability

The current pricing-only successor is
[fdlc-bedrock-price-qualified-20261010-v2.json](fdlc-bedrock-price-qualified-20261010-v2.json).
The original [qualified record](fdlc-bedrock-price-qualified.json), its source
hash, and its 2026-10-07 expiry remain unchanged as historical evidence.
The successor binds AWS's published 2026-10-08 price feed by SHA-256 and
expires at 2026-10-17 UTC for internal revalidation. Rates, token and payload
limits, disabled cache/reasoning controls, and spending ceilings are unchanged.
Its Converse digest is
`sha256:964a0d4c7d4d3fe75f69bd85ed44a7a6e60c9b2ba8f75aa3cc5f8289abd32592`;
its InvokeModel digest is
`sha256:55a78f1da07b78d13f8099002f86034a06c8337024db66a756e19c860ff79713`.
[Source qualification](../capability-control/evidence/pricing-20261010/source-review.json)
records exact model, region, tier, and rate keys. This refresh creates no
execution grant and migrates no reservation, approval or existing Work.

For the first live qualification, the maximum output is 4,096 tokens:

`1,000,000 × $3.30/M + 4,096 × $16.50/M = $3.367584`

The canonical reservation must commit 3,367,584,000 nano-USD before transport.
That value is a `MAXIMUM / RESERVED` estimate, remains below the authorized
$5.00 program ceiling, and is never overwritten by settlement. Provider token
usage is retained as `ACTUAL`; money derived from the versioned price remains
`ESTIMATED` until billing evidence exists.

The separate live-call authorization binds the canonical provider-price digest.
Startup supplies that same full price snapshot to both the transport and bridge;
substituted rates, ceilings, provider, model, or API fail before credential read.
The backend independently enforces that digest when registering the price,
creating the reservation, and admitting the physical request. Response evidence
keeps `MAXIMUM_RESERVED` pre-send cost separate from provider-reported token
usage and the resulting `ESTIMATED` settled cost.

## Enforcement and failure behavior

The bridge permits one physical call at a time and configures SDK attempts to
one, which means zero automatic retries. Fallback and streaming are absent.
Reservation, request, route, Attempt/lease, Execution Profile, price, exact
serialization, payload bytes, input bound, output cap, and proof amount must
agree before send. Replay, concurrent admission, exhausted budget, stale
authority, unknown capability, changed bytes, changed output, missing price, or
incomplete proof denies transport.

After a response, AWS-reported input/output token usage is reconciled against
the original hold. Usage above either bound freezes the reservation, records an
overrun incident, and permits no automatic retry. Ambiguous delivery retains
the full maximum as `UNKNOWN` until reconciliation.

The governing invariant is:

`maximum possible charge <= reserved liability <= remaining authorized budget`
