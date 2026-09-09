# Todo 063 Bedrock quota readback

State: `TODO_063_WAITING_FOR_AWS_SUPPORT`.

An authoritative `GetServiceQuota` read from qualification account
`083665737366` at `2026-09-07T23:15:56Z` reports applied capacity `0` for
Bedrock quota `L-B29C9321`. The quota is non-adjustable through Service Quotas.
AWS Support case `178882125400227` remains the existing request for the minimum
nonzero capacity; its latest recorded state is `UNASSIGNED`. The qualification
role cannot read the current Support case state.

The read used a temporary `servicequotas:GetServiceQuota` permission. Identity
Center provisioning completed `SUCCEEDED` before the read. The original policy
was then restored exactly and reprovisioned `SUCCEEDED`; final readback contains
24 statements and no `TemporaryRead*` statement. STS reverified the exact
`FDLCQualificationTFOperator` role in account `083665737366` after restoration.

No Bedrock provider request was sent and the fresh single-request authorization
remains unused. PR #194 CI is fully green at head `e31fc8f`, including System
Qualification V2. Live qualification, merge, release, and Production acceptance
remain fail-closed until AWS raises the applied quota above zero.

Machine-readable evidence is in [quota-readback.json](quota-readback.json).
