# Todo 063 Bedrock live qualification — account agreement gate

Status: **BLOCKED_PRE_MODEL_USE**

PR #214 landed the conservative liability contract as exact main
`beaf1f8cb293845ec2abaa6c3c1502676a5cf83b`. Its post-merge focused gate passed
256 tests, documentation consistency, and the unchanged runtime-contract v55
guard before any provider request.

At 2026-09-07T20:31:19Z, the exact approved STS principal and active US
geographic Sonnet 4.6 profile were revalidated. The one authorized synthetic,
non-streaming request then passed exact serialization and price binding. A
durable reservation committed the full 1,000,000-token conservative input bound,
4,096-token output bound, and 3,367,584,000 nano-USD maximum beneath the
5,000,000,000 nano-USD program ceiling before transport.

AWS received one request with SDK attempts fixed at one and returned
`ResourceNotFoundException` before model use. The account has not submitted the
required Anthropic model-use details. Independent readback reports
`authorizationStatus=AUTHORIZED`, `entitlementAvailability=AVAILABLE`,
`regionAvailability=AVAILABLE`, and `agreementAvailability=NOT_AVAILABLE`.
This is not another IAM gap and does not justify broader permissions.

No provider usage was returned. The bridge therefore retained the original
maximum as an `UNKNOWN` hold; it did not fabricate zero usage or estimated
spend. The temporary credential envelope was deleted immediately. No retry,
fallback, streaming request, alternate model, Global inference, direct
foundation-model invocation, Production authority, or second physical request
occurred.

The machine-readable result is [qualification-result.json](./qualification-result.json).
Todo 063 remains in progress, and Todo 064 remains dependency-blocked. Resumption
requires account-owner completion of the Anthropic use-case agreement followed
by new explicit one-request authority; the consumed one-request qualification
must not be replayed.
