# Todo 063 Bedrock live qualification — daily token gate

Status: `BLOCKED_AFTER_ONE_PROVIDER_REQUEST`

The account-level Anthropic use-case submission already matched the approved
company, website, internal-user, software-industry, and bounded synthetic
qualification purpose. Readback before and after the request reported Sonnet
4.6 agreement, authorization, entitlement, region, and the exact US geographic
inference profile as available. No model-access mutation or temporary
administrative authority was needed.

The prior request was reconciled from its exact provider request ID, pre-model
`ResourceNotFoundException`, and full-day `AWS/Bedrock` telemetry. The route
reported two client errors and no input, output, cache-read, or cache-write token
datapoints. Its canonical usage is therefore zero tokens with `ACTUAL` usage and
`ESTIMATED` zero cost; the original maximum reservation remains immutable.

One newly authorized synthetic, non-streaming request was then admitted from
exact main `2f5735d672af3fec21ce71ce235fae37e08a30ce`. Before transmission, the
gateway froze the 230-byte serialized request, its digest, the conservative
1,000,000-token input ceiling, a 16-token output ceiling, the qualified price
digest, and a 3,300,264,000 nano-USD maximum hold. Prior settled liability was
zero, so cumulative maximum liability remained below the 5,000,000,000 nano-USD
hard ceiling.

AWS received exactly one request and returned `ThrottlingException` with the
reason `Too many tokens per day, please wait before trying again.` Provider
request ID `6919db8e-f1c5-4f54-9557-db37ed817b74` reported one SDK attempt and
zero retry delay. CloudWatch recorded an exact-route invocation throttle in the
same minute. No provider usage was returned, so the new hold remains `UNKNOWN`
at its full maximum. No retry, fallback, stream, model substitution, Global
route, customer data, or Production credential was used. The temporary
credential envelope was deleted.

Todo 063 remains in progress. Todo 064 remains dependency-blocked. The new
blocking predicate is `BEDROCK_DAILY_TOKEN_ALLOWANCE_EXHAUSTED`. Another provider
request requires fresh explicit authorization after AWS reports usable daily
token capacity.

Machine-readable evidence:

- [qualification result](qualification-result.json)
- [prior liability reconciliation](prior-liability-reconciliation.json)
- [new reservation journal](reservation-journal.json)
