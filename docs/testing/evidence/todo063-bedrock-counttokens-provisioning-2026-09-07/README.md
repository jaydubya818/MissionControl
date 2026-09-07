# Todo 063 Bedrock CountTokens provisioning — 2026-09-07

Result: **NO INFERENCE — BEDROCK_COUNTTOKENS_UNSUPPORTED_FOR_APPROVED_PROFILE**.

The Product Owner authorized `bedrock:CountTokens` for the dedicated
`FDLCQualificationTFOperator` permission set in account `083665737366`, scoped
to the approved US Sonnet 4.6 inference profile. The Identity Center permission
set was reprovisioned successfully and the effective inline policy was read
back after provisioning.

The final policy contains no `bedrock:*` allow, no streaming allow, and no
Global inference-profile reference. `InvokeModel` remains limited to the exact
approved profile in `us-east-1`; its three regional backing models remain usable
only through that profile. CountTokens permits only the same profile and the
three backing model resources required by AWS to authorize that system-defined
US inference profile. An unrelated Nova model was rejected by an explicit deny.

Authenticated STS verification under `AWS_PROFILE=fdlc-qualification` returned
the expected account and `FDLCQualificationTFOperator` session. The exact
CountTokens request passed IAM authorization and reached Bedrock, which returned
`ValidationException: The provided model doesn't support counting tokens.`
Calling with the profile ID instead of its ARN produced the same provider
capability result. This is not an authorization denial and cannot provide the
required deterministic token bound.

No Converse or InvokeModel request was sent. No reservation, provider inference
response, retry, fallback, or spend occurred. Todo 063 remains open at its
existing preflight checkpoint, and todo 064 remains dependency-blocked. Resume
only when AWS supports CountTokens for this exact approved profile or the
Product Owner authorizes a different bounded preflight contract.

Evidence:

- [provisioning receipt](provisioning.json)
- [effective authorization scope](authorization-scope.json)
- [CountTokens capability result](counttokens-capability.json)
- [reviewed immutable pricing facts](pricing-source-review.json)
