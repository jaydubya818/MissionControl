# FDLC Phase 1 Bedrock qualification report

Updated: 2026-09-06. Authoritative baseline: Mission Control main
`46544a44cc3cfc0413246d5abc3571c848bec00c`, runtime contract v53. The
candidate is reconciled with the accounting-recovery, Factory Engineer
package-import, orchestration-readiness, incident-evidence, and governed
repository-dispatch incident-control changes now on canonical main.

Status: **AWS_IDENTITY_AND_ROUTE_INSPECTION_PASS**.

External boundary: **QUALIFICATION_AWS_INVOKE_PERMISSION_REQUIRED**.

No readiness, WorkOrder execution, pilot acceptance, release, or Production
qualification is claimed.

## Authority and identities

The owning team is **FDLC / Mission Control**. **Jarrett West** is champion,
Human FDE / Operator, and Incident Commander. Combining these pilot roles does
not combine Plan approval, WorkOrder authorization, independent verification,
acceptance, publication, merge, release, incident, budget, security, or rollback
authority.

The approved non-Production identity is:

- AWS account: `083665737366` (`FDLC Factory Engineer Qualification`)
- named SSO profile: `fdlc-qualification`
- source region: `us-east-1`
- Mission Control project: `sn71gskbdemgf4z1trt9zdmm5h8bde69`
- role ARN: `arn:aws:iam::083665737366:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_FDLCQualificationTFOperator_338e027890ecd783`
- verified STS principal: `arn:aws:sts::083665737366:assumed-role/AWSReservedSSO_FDLCQualificationTFOperator_338e027890ecd783/jaydubya818@gmail.com`

The safe handoff and approval record contain metadata only. No access key,
secret key, session token, SSO cache content, or unrelated AWS configuration was
read or persisted.

## Exact Bedrock route

AWS control-plane evidence verifies:

- underlying model: `anthropic.claude-sonnet-4-6`
- model lifecycle: `ACTIVE`
- supported inference type: `INFERENCE_PROFILE`
- profile: `us.anthropic.claude-sonnet-4-6`
- profile ARN: `arn:aws:bedrock:us-east-1:083665737366:inference-profile/us.anthropic.claude-sonnet-4-6`
- fixed destinations: `us-east-1`, `us-east-2`, `us-west-2`
- Global inference: prohibited

The route digest remains
`sha256:854a2514b9b519722dea09f1d3045241ee42a8f2aa580740b6dab89f45fd940e`.
The existing `codex/v1` identity remains
`sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06`.
The separately versioned `codex/bedrock-v1` identity remains
`sha256:8c65005a0717a79d0fa8a7014a90e302ccdd0f9e5f474534cd08fe89f11cb17d`.

## Pricing and hard liability

The qualified 24-hour price record uses the current standard US-only Sonnet 4.6
rates: $3.30 per million input tokens, $16.50 per million output tokens, $0.33
cache reads, $4.125 five-minute cache writes, and $6.60 one-hour cache writes.
AWS documents that geographic cross-region inference uses the source-region price
without a routing surcharge. The reservation calculation conservatively prices
all input at the highest input-side rate while cache and reasoning remain disabled.

The live qualification ceiling is exactly $5.00 total. The first synthetic route
request reserved $0.924528 before dispatch. The SDK made one HTTP attempt with no
automatic retry. AWS rejected it before inference with HTTP 403 and provider
request ID `24e8d1d5-c7ff-4cc3-b66d-32d08c4925ee`; it returned no output and no
token usage. The ledger classifies the request `REJECTED_PRE_INFERENCE`, settles
actual model cost at $0, and leaves the full $5.00 ceiling available.

## Permission incompatibility and required action

The assigned Identity Center permission set still contains the inspection policy's
explicit `HoldAllInference` deny. That deny overrides any allow and blocks
`bedrock:InvokeModel` on the exact approved profile. The assigned role cannot call
Identity Center administration APIs or modify its own permission set.

After a fresh named-profile SSO login on 2026-09-06, the AWS access portal was
rechecked. It exposes exactly one account, `083665737366`, and exactly one role,
`FDLCQualificationTFOperator`. The portal was checked again after direct
authorization to perform the administrative change and still exposed no Identity
Center administrator assignment. The qualification role was not used to modify
itself. No ambient profile, unrelated account, cached credential, or root identity
was used.

An Identity Center administrator must:

1. replace the inspection policy with
   `docs/software-factory/fdlc-bedrock-invocation-policy.json`;
2. reprovision permission set `FDLCQualificationTFOperator` to account
   `083665737366`; and
3. leave the existing account assignment and named SSO profile unchanged.

The replacement policy allows only non-streaming `bedrock:InvokeModel` through
the exact account profile and exact three destination foundation-model ARNs. It
denies direct-model invocation, other model/profile resources, other source
regions, Global routing, and streaming.

## Completed offline qualification

The candidate adds a direct named-profile credential provider without enabling
the AWS default credential chain, binds qualified prices to committed primary
source evidence, preserves single-attempt transport, and makes the Bedrock adapter
report ready only when the governed route authorization is configured. Runtime
contract checks, type checking, focused Bedrock tests, the complete orchestration
suite, release security, authorization, secret scanning, Factory documentation,
and whitespace checks pass on current main. Implementation commit
`3a69f9cb168c021bd543346af7d4925ce7036b7c` then passed all 19 commit-bound
System Qualification checks, including full repository tests, lint, build,
startup smoke, golden eval, historical evidence immutability, and runtime v51
compatibility. The System evidence is in
`docs/testing/evidence/fdlc-bedrock-live-system-20260906/`.

After reconciliation, candidate commit
`bd3746b3b326da44ccba373e7134fdac53a65472` passed all 19 current System
Qualification V2 checks against canonical main `f01fed47ded95e9456803845211bac49ef54a1f1`
and runtime contract v52. This includes 1,274 Convex tests, 670 orchestration
tests with 11 intended skips, the complete repository suite, lint, build,
startup smoke, release security, and the runtime-contract guard. Current evidence
is in `docs/testing/evidence/fdlc-bedrock-live-system-v52-f01fed-20260906/`.

The latest reconciliation merge commit
`09ce369fe1408113554f94c90798cf57a0e046e7` then passed all 19 System
Qualification V2 checks against canonical main
`46544a44cc3cfc0413246d5abc3571c848bec00c` and runtime contract v53. This run
includes 1,284 Convex tests, 670 orchestration tests with 11 intended skips,
the complete repository suite, authorization and secret scanning, lint, build,
startup smoke, historical-evidence immutability, and the runtime-contract guard.
The evidence is in
`docs/testing/evidence/fdlc-bedrock-live-system-v53-46544a-20260906/`.

## Blocked work

Until the permission set is reprovisioned, the following work remains inadmissible:

- successful live route proof;
- producer and independent verifier Execution Profiles;
- frozen Factory Version and derived readiness;
- WO1 and the remaining ten-WorkOrder pilot cohort;
- human acceptance, merge/release qualification, Production deployment,
  Production acceptance, and rollback exercise.

WO1 has not executed. No Factory Version or readiness state has been created
manually.

## Deterministic resume and rollback

After reprovisioning, authenticate only `fdlc-qualification`, reverify STS and the
profile topology, and run `scripts/fdlc-bedrock-live-route-qualification.mts` once.
The runner revalidates current price, route, identity evidence, cumulative liability,
payload bounds, one-attempt transport, and the $5 ceiling before sending.

Keep Bedrock enablement and configuration disabled while the hold remains. On any
ambiguous provider outcome, retain the full unresolved liability and do not replay.
On an incident, cancel the canonical Attempt, fence new sends, retain receipts, and
reconcile only exact labeled Docker resources. Restoring a known-good deployment
does not waive independent acceptance or release gates.
