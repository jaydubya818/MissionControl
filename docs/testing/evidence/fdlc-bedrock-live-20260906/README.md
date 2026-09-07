# FDLC Bedrock live qualification evidence

Historical state: `BEDROCK_QUOTA_ADMIN_ACTION_REQUIRED`.

Current authoritative state:
`BEDROCK_ACCOUNT_AGREEMENT_AND_LIABILITY_RECONCILIATION_REQUIRED`. A later
authorized request is recorded under
`docs/testing/evidence/todo063-bedrock-live-qualification-2026-09-07/`. It
reached Bedrock's Anthropic use-case agreement gate and retained a separate
$3.367584 conservative liability as `UNKNOWN`. This directory remains the
immutable evidence for the earlier 429 and its zero-billable reconciliation.

The named SSO profile authenticated to the approved non-Production account. Safe
AWS responses prove the exact caller, ACTIVE US inference profile, three fixed US
destination model ARNs, and inference-profile-only Sonnet 4.6 model topology.

The narrow `FDLCQualificationICAdmin` identity applied and reprovisioned the
reviewed policy to `FDLCQualificationTFOperator`. Provisioning request
`561a9ea1-d73f-42f6-8387-4c901c00d35b` completed `SUCCEEDED`; policy read-back
is semantically exact. `AccountFullAccessRole` was not used, and the administrator
made no Bedrock call.

After returning to `fdlc-qualification`, the exact profile route remained ACTIVE.
The bounded CountTokens check passed with 44 tokens through the underlying model;
AWS documents that this CRIS-only model does not support CountTokens through its
profile identifier. The next one-attempt synthetic invocation passed IAM and
reached Bedrock, then received HTTP 429, provider request ID
`641e32f7-5dfa-4056-84ba-affc2c2938aa`, and `Too many tokens per day`. It made
zero retries and used no fallback. The follow-up provider telemetry query found
exactly one `InvocationThrottles` datapoint at the request minute and no
`Invocations`, `InputTokenCount`, or `OutputTokenCount` datapoints for the route
during the UTC-day window. Together with the pre-processing quota rejection and
empty runtime usage/output, this proves zero billable inference. The ledger
releases the `$0.924528` reservation, records `$0` settled and `$0` unresolved,
and restored `$5.00` uncommitted capacity at that historical checkpoint. The
later account-agreement attempt reserved $3.367584, leaving $1.632416
uncommitted under the program ceiling. This accounting reconciliation does not
release the provider quota hold or the later liability hold.

The exact blocking quota is `L-B29C9321`, **Model invocation max tokens per day
for Anthropic Claude Sonnet 4.6 (doubled for cross-region calls)**. The documented
default is 4,320,000,000 tokens per day and the quota is non-adjustable, but the
restricted role is denied Service Quotas read and request-history APIs. Its
account-specific applied value, prior requests, and reset/activation condition
therefore require an authorized administrator in account `083665737366` or AWS
Support. No further model call is permitted until that state is read and positive
capacity is confirmed.

`pricing-evidence.json` binds the conservative liability contract to current
primary AWS route documentation and Anthropic's 2026-05-27 US-only Sonnet 4.6
list prices. The pricing contract hashes that committed record directly.
