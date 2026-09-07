# Bedrock qualification role policy specification

Status: INVOCATION POLICY PROVISIONED / PROVIDER DAILY TOKEN QUOTA BLOCKED.
Account, role, SSO profile, route, policy read-back, and provisioning are
verified. `HoldAllInference` is absent from the effective permission set.
`bedrockIamSpecification` generates account-scoped inspection and separate future
invocation policies only after strict route validation. No trust principal is
invented. Bootstrap must provide the role trust policy and credential delivery.

Inspection permits only GetInferenceProfile for the exact us-east-1 system profile
and GetFoundationModel for the three exact destination model ARNs. An explicit
invocation deny preserves the hold. STS GetCallerIdentity is a read-only identity
check, not permission to assume a role. No profile list/create/delete or IAM write
permission is needed. No account-wide Bedrock allow is generated.

The invocation specification allows non-streaming InvokeModel,
which also authorizes Converse. Underlying foundation-model access is conditional
on the exact `bedrock:InferenceProfileArn`. Explicit denies cover other resources,
direct model invocation, streaming, and Regions outside the profile's three US
destinations. The permission set's general single-Region deny excludes only
`bedrock:InvokeModel`; all other services retain the `us-east-1` restriction.
The route policy then constrains model inference to the exact profile, model, and
US destinations. Global routing remains denied because `unspecified` is outside
that destination set.
Wildcards appear only in deny statements. No policy attachment occurs here.

An independent reviewer must verify effective IAM/SCP behavior in the approved
account, including AWS cross-region authorization context, trust constraints,
source endpoint enforcement, all three destination resources and deny precedence.
A unit test is not an IAM simulator or proof of effective AWS permissions. The
narrow `FDLCQualificationICAdmin` identity applied the reviewed policy and
reprovisioned `FDLCQualificationTFOperator` to account `083665737366`; request
`561a9ea1-d73f-42f6-8387-4c901c00d35b` completed `SUCCEEDED`, and the effective
policy read-back is semantically exact. A subsequent one-attempt request passed
IAM authorization and reached Bedrock, which rejected it with HTTP 429 and
`Too many tokens per day`. No retry or fallback occurred. The provider route
cannot be marked qualified until daily token capacity is available and the
single bounded request succeeds.

Primary references: [AWS profile prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html),
[Converse authorization](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).
