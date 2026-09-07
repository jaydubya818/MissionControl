# Todo 063 Bedrock live preflight — 2026-09-07

Result: **NO CALL — BEDROCK_COUNTTOKENS_PERMISSION_REQUIRED**.

The Product Owner authorized the dedicated non-Production qualification identity,
the exact US geographic Sonnet 4.6 inference profile, and a maximum cumulative
live-call liability of USD 5.00 with zero retries and zero fallbacks. No customer
or private data was permitted.

Authenticated read-only checks passed for the exact STS identity and Bedrock
profile topology. The following CountTokens call used only the synthetic text
`Reply with exactly: QUALIFICATION_OK` and failed before inference because the
verified principal lacks `bedrock:CountTokens` on the approved profile.

No Converse or InvokeModel request was sent. No reservation, provider response,
usage, retry, fallback, or spend exists. The live qualification, two-route
comparison, Todo 063 closure, and Todo 064 start remain inadmissible.

Evidence:

- [identity and profile](identity-profile.json)
- [CountTokens denial](counttokens-denial.json)

Resume only after the AWS Identity Center permission is provisioned. Reverify the
same STS account/principal and active profile topology, then repeat CountTokens.
Only a successful token bound may proceed to exact price binding, maximum
liability calculation, durable reservation, and one authorized inference send.
