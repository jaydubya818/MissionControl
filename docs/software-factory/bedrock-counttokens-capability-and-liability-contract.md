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

The reviewed price artifact is
[fdlc-bedrock-price-qualified.json](fdlc-bedrock-price-qualified.json). It binds
the dated Anthropic price source by SHA-256, retains input, output, cache, and
reasoning rates, disables cache controls and extended reasoning in the admitted
serializer, and expires on 2026-10-07 for revalidation.
Its canonical provider-price qualification digest is
`sha256:ba19028022ec2de109d2863415263b691d13d334618d7f49e7524f3c07e33160`.

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
