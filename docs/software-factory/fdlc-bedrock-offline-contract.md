# Bedrock offline adapter contract

Evidence class: OFFLINE / FIXTURE. No SDK credential chain, network client, live
route registration or dispatch binding is activated. The fixture transport port
is deliberately separate from the future credential-isolated live binding.
Existing Factory Docker inference denial stays enforced.

`bedrockRoute` validates exact provider, model, foundation ARN, US profile ID/ARN,
account, role and destination set. `verifyBedrockProfile` checks a supplied ACTIVE
SYSTEM_DEFINED inspection response, including exactly three underlying model ARNs.
It grants no authority and does not establish where a request actually executed.

`bedrockAdapter` implements non-streaming Converse and InvokeModel text/tools,
max-output propagation, tool-result continuation, strict response parsing and
provider request IDs from response metadata (never the body message ID).
Timeout/cancel aborts the transport and fences its late response. Transient error
classification never triggers a retry. Every attempted send can have an unknown
billable outcome, including throttles and server errors.

Qualification requests do not enable caching, thinking, streaming, multimodal content,
service-tier overrides or arbitrary model fields. Unsupported response dimensions
are rejected and preserve liability. Cache/reasoning pricing fields remain explicit.
The original null `UNQUALIFIED` record remains historical; the exact Sonnet 4.6 US
standard qualification rate is now frozen in `fdlc-bedrock-price-qualified.json`.
Conversion rounds fractional nano-USD per-token rates upward. Because the strict
request schema cannot emit cache controls and reasoning is disabled, those billing
dimensions remain in the source contract but cannot increase this admitted request.
Calculated money is estimated cost, never an invoice claim.

`bedrockBudgetAdapter` composes the existing canonical reservation/settlement
transitions with the serialized request digest and exact route digest. Input
liability reserves either an exact provider CountTokens result on a qualified
supported route or the entire model context ceiling on this explicitly unsupported
route, never an optimistic byte heuristic. Unknown capability fails closed.
Payload bytes and output limits are checked separately. The transaction port must
commit durably before send; tests use a serialized in-memory fixture. The existing
Convex transaction handler is the production monetary authority, not that fixture.
Settled maximum holds are retained against corrections. Replays, concurrent sends,
unknown results, expiry and observed overruns fail closed; overruns freeze capacity.

Live binding must use the existing signed service-command reservation and receipt
APIs with a qualified account-specific transport, current Attempt/lease and exact
profile. It must prove credential isolation and no bypass in the immutable runtime.
No local fixture can certify that integration or provider billing behavior. The
separately approved first call has a $5.00 total ceiling; its full input and 4,096
output liability is $3.367584 under the expiring qualified price. See
`bedrock-counttokens-capability-and-liability-contract.md` for the exact proof.

API references: [Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html),
[Anthropic Messages](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html),
[TokenUsage](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_TokenUsage.html),
[GetInferenceProfile](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetInferenceProfile.html).
