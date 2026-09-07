# Todo 063 Bedrock worker CountTokens qualification

Status: `BLOCKED_BEFORE_INFERENCE`

The approved Terraform plan added `bedrock:CountTokens` only to the existing
qualification worker role and its Bedrock runtime VPC endpoint policy. The plan
reported zero creates, two in-place updates, and zero destroys. Targeted
post-apply drift was clean. A full-stack plan retained two pre-existing,
unapplied database-related updates; they were outside the approved scope.

The human permission set was unchanged during this operation. Its canonical
before and after fingerprint was
`sha256:b0eb4bd2709521174b6f5e29d4706b47a969625f7a435158bf2d995ee1d64279`.
Readback proved that the worker and endpoint policies changed only by adding
`bedrock:CountTokens` beside the existing non-streaming invocation action.

An initial one-off worker task failed before Bedrock because the intentionally
isolated worker network has no STS endpoint. A corrected task removed that
unnecessary identity probe. It used the same immutable task definition, exact
worker role, private subnets, worker security group, and Bedrock endpoint. IAM
and the endpoint admitted the request, but Bedrock returned
`ValidationException: The provided model doesn't support counting tokens.` for
the approved inference profile.

No generation request, reservation, provider response, automatic retry,
fallback, or billable inference occurred. The required token-count gate did not
pass, so Todo 063 remains in progress and Todo 064 remains dependency-blocked.

Source-of-truth delivery:

- AI-FDE PR: `#4`
- Reviewed head: `b97ce33e1dd79a9cd36b8e8711ab6a33734bea71`
- Merge commit: `8c2aa2b026e8af3ba60fad9d70eef859d4d9c981`
- Exact-main tree matched the reviewed head
- Exact-main CI: run `34154554796`, all trust, Terraform, container, frontend,
  and browser gates passed
