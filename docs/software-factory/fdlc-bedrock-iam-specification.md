# Bedrock qualification role policy specification

Status: OFFLINE / SPECIFICATION. Not applied. Account and role are unresolved.
`bedrockIamSpecification` generates account-scoped inspection and separate future
invocation policies only after strict route validation. No trust principal is
invented. Bootstrap must provide the role trust policy and credential delivery.

Inspection permits only GetInferenceProfile for the exact us-east-1 system profile
and GetFoundationModel for the three exact destination model ARNs. An explicit
invocation deny preserves the hold. STS GetCallerIdentity is a read-only identity
check, not permission to assume a role. No profile list/create/delete or IAM write
permission is needed. No account-wide Bedrock allow is generated.

The separate future invocation specification allows non-streaming InvokeModel,
which also authorizes Converse. Underlying foundation-model access is conditional
on the exact `bedrock:InferenceProfileArn`. Explicit denies cover other resources,
direct model invocation, streaming, and other source/global request regions.
Wildcards appear only in deny statements. No policy attachment occurs here.

An independent reviewer must verify effective IAM/SCP behavior in the approved
account, including AWS cross-region authorization context, trust constraints,
source endpoint enforcement, all three destination resources and deny precedence.
A unit test is not an IAM simulator or proof of effective AWS permissions. Retain
the invocation deny until the separately authorized minimum model call.

Primary references: [AWS profile prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html),
[Converse authorization](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).
