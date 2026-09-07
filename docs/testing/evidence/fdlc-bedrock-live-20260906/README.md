# FDLC Bedrock live qualification evidence

State: `QUALIFICATION_BEDROCK_DAILY_TOKEN_QUOTA_REQUIRED`.

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
zero retries and used no fallback. Because the response contains no usage receipt,
the ledger conservatively retains the full `$0.924528` reservation as unresolved,
leaving `$4.075472` uncommitted under the hard `$5` ceiling. The runner now blocks
another dispatch while any liability remains unresolved.

The remaining dependency is available daily Sonnet 4.6 token capacity in account
`083665737366`; no further call is permitted until the quota resets or AWS makes
capacity available and the existing unresolved liability is reconciled.

`pricing-evidence.json` binds the conservative liability contract to current
primary AWS route documentation and Anthropic's 2026-05-27 US-only Sonnet 4.6
list prices. The pricing contract hashes that committed record directly.
