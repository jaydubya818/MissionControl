# FDLC Phase 1 Bedrock qualification report

Updated: 2026-09-07. Authoritative baseline: Mission Control main
`2f5735d672af3fec21ce71ce235fae37e08a30ce`, runtime contract v55. The
candidate is reconciled with the accounting-recovery, Factory Engineer,
orchestration-readiness, incident-evidence, and repository-dispatch controls on
canonical main.

Status: **BLOCKED_PRE_MODEL_USE / BEDROCK_ACCOUNT_AGREEMENT_AND_LIABILITY_RECONCILIATION_REQUIRED**.

External boundary: **BEDROCK_ACCOUNT_AGREEMENT_AND_LIABILITY_RECONCILIATION_REQUIRED**.

No readiness, WorkOrder execution, pilot acceptance, release, or Production
qualification is claimed.

## Authority and identities

The owning team is **FDLC / Mission Control**. **Jarrett West** is champion,
Human FDE / Operator, and Incident Commander. Combining these pilot roles does
not combine Plan approval, WorkOrder authorization, independent verification,
acceptance, publication, merge, release, incident, budget, security, or rollback
authority.

The approved runtime identity remains:

- AWS account: `083665737366` (`FDLC Factory Engineer Qualification`)
- named SSO profile: `fdlc-qualification`
- source region: `us-east-1`
- Mission Control project: `sn71gskbdemgf4z1trt9zdmm5h8bde69`
- permission set: `FDLCQualificationTFOperator`
- verified principal: `arn:aws:sts::083665737366:assumed-role/AWSReservedSSO_FDLCQualificationTFOperator_338e027890ecd783/jaydubya818@gmail.com`

The verified narrow administrative identity is `FDLCQualificationICAdmin` in
delegated-administration account `955857822343`. Its permission-set ARN is
`arn:aws:sso:::permissionSet/ssoins-7223d66bba59dce4/ps-af3c937e390e975c`.
It has no attached AWS-managed or customer-managed policies and may change and
provision only `FDLCQualificationTFOperator` for account `083665737366` in the
identified Identity Center instance. `AccountFullAccessRole` was not used.

No access key, secret key, session token, SSO cache content, or unrelated AWS
configuration is stored in qualification evidence.

## Exact Bedrock route

AWS control-plane evidence verifies:

- provider: AWS Bedrock
- underlying model: `anthropic.claude-sonnet-4-6`
- model lifecycle: `ACTIVE`
- supported inference type: `INFERENCE_PROFILE`
- profile: `us.anthropic.claude-sonnet-4-6`
- profile ARN: `arn:aws:bedrock:us-east-1:083665737366:inference-profile/us.anthropic.claude-sonnet-4-6`
- fixed destinations: `us-east-1`, `us-east-2`, `us-west-2`
- Global inference: denied
- streaming: denied
- direct foundation-model invocation: denied
- unrelated models and profiles: denied

The route digest remains
`sha256:854a2514b9b519722dea09f1d3045241ee42a8f2aa580740b6dab89f45fd940e`.
The `codex/v1` identity remains
`sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06`.
The separate `codex/bedrock-v1` identity remains
`sha256:8c65005a0717a79d0fa8a7014a90e302ccdd0f9e5f474534cd08fe89f11cb17d`.

## Identity Center policy and provisioning

The initial authoritative invocation policy SHA-256 was
`b89537a26d8a9f0f4e1f2d0455c9985ae8da63fe2623c4e94c671c30097d464d`.
Live IAM qualification found two cross-region conflicts in effective policy:
the invocation policy denied destination-region evaluation, and the older base
`DenyOutsideQualificationRegion` statement denied every non-`us-east-1`
`InvokeModel` evaluation. Both failures returned HTTP 403 before inference,
with one attempt, zero retries, zero output, and zero actual spend.

The corrected invocation policy SHA-256 is
`6a7ecb6ea08320eb5276acafc36c745d15f2866bb805d114897fe358df349e03`.
It follows AWS's geographic cross-region authorization contract: the exact
profile is allowed only from `us-east-1`; each of its three foundation-model
destinations is allowed only when `bedrock:InferenceProfileArn` equals the exact
approved profile. Explicit denies retain the exact model/profile boundary,
direct invocation restriction, streaming restriction, and all Regions outside
the three approved US destinations. The general qualification-region deny now
excludes only `bedrock:InvokeModel`, so every other service remains restricted to
`us-east-1`; the route policy supplies the narrower Bedrock region boundary.

The narrow administrator applied the full composed inline policy and provisioned
permission set `FDLCQualificationTFOperator` to account `083665737366`.
Provisioning request `561a9ea1-d73f-42f6-8387-4c901c00d35b` completed
`SUCCEEDED`. Canonicalized AWS read-back exactly matches the applied policy, with
digest `sha256:1a9f5487e1e11c3bbcf009648fa11e779673b691b064f29379ff23d0beeca7e5`.
The administrator made zero Bedrock calls and zero Production mutations.

## CountTokens and live qualification

The frozen synthetic input digest is
`sha256:abd21ce1366ecfff6b5cd2b179c88c4b1b1333370de4c68b4a295eff16fbcf83`.
`CountTokens` through the profile identifier returned AWS's documented
compatibility error for this CRIS-only model. Counting the same frozen input
through underlying model `anthropic.claude-sonnet-4-6` passed with 44 input
tokens, one attempt, and zero retries. This was token counting, not inference.

After the final policy reprovisioning, the restricted qualification identity made
one bounded synthetic request. It passed IAM authorization and reached Bedrock.
Bedrock returned HTTP 429, request ID
`641e32f7-5dfa-4056-84ba-affc2c2938aa`, and `Too many tokens per day, please wait
before trying again.` The SDK recorded one attempt, zero retry delay, no fallback,
no model output, and no usage receipt.

The pricing record uses the current standard US-only Sonnet 4.6 rates: $3.30 per
million input tokens and $16.50 per million output tokens, with cache rates
recorded but caching disabled. The hard live qualification ceiling remains
$5.00. The latest request reserved at most $0.924528. A subsequent read-only
CloudWatch query covering the UTC day through the request window found one
route-specific `InvocationThrottles` datapoint at the request minute and no
`Invocations`, `InputTokenCount`, or `OutputTokenCount` datapoints. AWS performs
this quota check before inference and bills actual token usage. Combined with the
empty runtime output and usage receipt, the evidence proves zero billable
inference. That request's ledger records $0 settled and $0 unresolved. The
provider quota hold remains active independently of the accounting result.

Canonical main subsequently recorded a separate authorized request at
2026-09-07T20:31:19Z after the conservative full-context liability contract
landed. Before transport, that request durably reserved 3,367,584,000 nano-USD
for the 1,000,000-token input ceiling plus 4,096 output tokens. AWS returned
`ResourceNotFoundException`, request ID
`7f488e66-813d-4a33-adb0-1d6c98146b39`, before model use because Anthropic
use-case details have not been submitted for account `083665737366`.
Independent readback reports `agreementAvailability=NOT_AVAILABLE` while
authorization, entitlement, and region availability remain present. No usage
receipt was returned, so the complete $3.367584 reservation remains `UNKNOWN`.
The program ceiling has $1.632416 uncommitted capacity, but no additional
physical request is authorized or admissible.

## Completed qualification

- Current AWS identity, source region, profile ARN, topology, model, and three US
  destinations are verified.
- CountTokens compatibility and the supported underlying-model counting path are
  recorded.
- The narrow Identity Center administrator assignment and target-only authority
  are verified.
- The exact target permission set is provisioned and read back.
- IAM now admits the approved request as far as the Bedrock provider quota gate.
- Focused Bedrock tests, Factory documentation validation, and policy consistency
  checks pass after the correction.
- Pre-reconciliation candidate commit
  `447ef6569b4e868efee6dbbe290d121abd2eb74b` passed all 19 System
  Qualification V2 checks against baseline
  `46544a44cc3cfc0413246d5abc3571c848bec00c` and runtime v53. The run includes
  1,284 Convex tests, 671 orchestration tests with 11 intended skips, full
  repository tests, authorization, secret scanning, lint, build, startup smoke,
  historical evidence immutability, and the runtime-contract guard.
- Integrated merge commit `47ba04dd03d1a236f18234cbbe2b14921372d2aa`
  passed all 19 System Qualification V2 checks against current main
  `73c6d954bceba490a5b65e4b50f0897c01f11863` and runtime v55. The run includes
  1,420 Convex tests, 714 orchestration tests with 11 intended skips, full
  repository tests, authorization, secret scanning, lint, build, startup smoke,
  historical evidence immutability, and the runtime-contract guard.
- Merge commit `ee2065e4a8d2e70063f8a453da7a109dccfc3de0` then integrated
  current main `ee870794cddb426824fc881a520ccdda028060d6`. That main delta contains
  only Todo 063 documentation and CountTokens evidence; it changes no runtime
  code or public contract. Factory documentation, secret scanning, JSON, and
  whitespace checks pass on the resulting exact head. PR CI supplies the final
  remote exact-head qualification.
- Commit `14c34b46ad4451f11ec69b07546efad9c6aa510e` records the zero-billable
  429 reconciliation and adds the fail-closed quota confirmation gate. Merge
  commit `32160c4f3c7131b16a96faa56ccd757322751deb` integrates canonical main
  `beaf1f8cb293845ec2abaa6c3c1502676a5cf83b`, including its conservative
  full-context liability contract. The conflict resolution retains main's
  explicit temporary-credential envelope and authenticated STS check; it does
  not restore profile or default-chain credential discovery. Quota-gate tests,
  all 80 focused Bedrock transport/adapter/liability tests, typechecking,
  Factory documentation validation, secret scanning, and the two affected
  full-system/Fab suites pass on the integrated head.
- Canonical main `466342b5be97434630984fd6e9c99f7279263ca2` records the later
  account-agreement failure and its retained conservative liability. Merge
  commit `ea2dceeeb818c21831fae71137780cb626591c31` integrates that
  authoritative evidence while preserving the earlier quota event and
  reconciliation as historical evidence.
- Canonical main `2f5735d672af3fec21ce71ce235fae37e08a30ce` pins the complete
  qualified Bedrock price digest at registration, reservation, and physical
  request admission. Merge commit `53950c985c8d66ad52f41c2346cdef1c521e2e0c`
  integrates that hardening without changing the active agreement, liability,
  quota, or one-request authorization holds.

Evidence is under
`docs/testing/evidence/fdlc-bedrock-live-20260906/`, including caller identity,
profile topology, CountTokens result, pricing, the effective permission-set
policy, provisioning status, failure receipt, and liability ledger.
Commit-bound System evidence is under
`docs/testing/evidence/fdlc-bedrock-live-system-v53-447ef65-20260907/`.
Current-main System evidence is under
`docs/testing/evidence/fdlc-bedrock-live-system-v55-47ba04d-20260907/`.
The newest authoritative provider-attempt evidence is under
`docs/testing/evidence/todo063-bedrock-live-qualification-2026-09-07/`.

## Remaining boundary and deterministic resume

`BEDROCK_ACCOUNT_AGREEMENT_AND_LIABILITY_RECONCILIATION_REQUIRED` is the current
external dependency. The account owner for `083665737366` must submit the
Anthropic model-use details required by Bedrock for Sonnet 4.6 and wait until
authoritative readback reports `agreementAvailability=AVAILABLE`. This action
does not require broader IAM authority and must not change the approved profile,
model, source Region, US geographic topology, account, or runtime role.

The later request's 3,367,584,000 nano-USD hold remains `UNKNOWN` because AWS
returned no usage. It must be independently reconciled from authoritative
provider or billing evidence before another reservation. The earlier quota
`L-B29C9321` remains a separate fail-closed precondition: an authorized
administrator in account `083665737366` must still record its applied value,
request history, and sufficient available capacity. If insufficient, the
administrator must open or update one AWS Support request for this exact
non-adjustable quota and US route; duplicate requests are prohibited.

Before any new inference attempt:

1. complete the Anthropic use-case agreement and record `AVAILABLE` readback;
2. reconcile or retain the $3.367584 `UNKNOWN` liability using authoritative
   provider or billing evidence;
3. record the account-specific value and request history for `L-B29C9321`;
4. obtain authoritative AWS confirmation that sufficient daily and applicable
   per-minute capacity are available for the exact approved route;
5. obtain a new explicit one-request authorization because the prior authority
   was consumed;
6. reverify `fdlc-qualification`, account `083665737366`, `us-east-1`, and the
   exact profile topology;
7. refresh the 24-hour price contract if expired; and
8. run the bounded qualification runner once, with zero retries and no fallback.

Todo 063 remains in progress because a successful live provider receipt, the
ten accepted real-work outcomes, complete outcome coverage, and a second
independently qualified route are still absent. Todo 064 remains dependency
blocked and has not started. WO1 has not executed. No Factory Version or
readiness state has been created manually.

On an incident, cancel the canonical Attempt, fence new sends, retain receipts,
and reconcile only exact labeled Docker resources. Restoring a known-good
deployment does not waive independent acceptance or release gates.
