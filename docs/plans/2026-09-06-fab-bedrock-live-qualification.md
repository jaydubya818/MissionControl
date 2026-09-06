# Fab Phase 3 Bedrock qualification continuation

Fab needs a real, bounded Bedrock route without taking credential, budget,
verification, acceptance, or publication authority from Mission Control. The
approved route is Sonnet 4.6 through its US geographic inference profile, with
source region us-east-1 and destinations us-east-1, us-east-2, and us-west-2.
Global routing and automatic retries are excluded. The program ceiling is $5.

## Implementation

1. Add a credential-free Bedrock ModelProvider to Fab. Serialize only supported
   text/tool messages; preserve exact route, request, usage, and uncertainty
   evidence. Keep unsupported response fields unqualified. Existing HTTP providers
   must reject Bedrock rather than silently use the Anthropic endpoint.
2. Bind its broker transport in Mission Control to the existing canonical
   Attempt/lease and inference reservation/receipt path. Credentials remain in
   the explicitly enrolled broker identity; Fab receives a safe reference only.
   The existing gateway is not an Experimental qualification admission grant.
   Its current authority checks must remain intact until an exact qualification
   admission is implemented and independently reviewed.
3. Before every inference, freeze the request, count its exact input tokens using
   Bedrock CountTokens, and reserve input plus maximum output liability with no
   retries, fallback, cache creation, reasoning, batch, or premium service tier.
   Unknown effects retain their full reservation. CountTokens failure prohibits
   inference; byte counts are not presented as a proven token bound.
4. Use the existing five engineering families, then persisted deployed lineage,
   separate verifier Attempts, human decisions, permits, and one dedicated
   GitHub qualification target. Reconnect and lost-response reconciliation must
   prove no blind replay. Qualification PRs are not merged by Fab.
5. Qualify source fixes, perform independent reviews, merge through required CI,
   and reproduce exact final mains. Keep whole-agent containment UNQUALIFIED and
   Fab Experimental until the evidence supports a different label.

## Evidence and external prerequisites

The task-local authoritative record is
`/private/tmp/fab-phase3-delivery/README.md`. It contains safe selected account
metadata; account-specific records are not copied into this public repository.
Current AWS SSO caller identity and the exact inference profile have been checked
read-only. Those checks are not model invocation or deployment evidence.

The dedicated Mission Control deployment/project and the qualification GitHub
repository/App scope must be established before any model call. Existing
production and unrelated developer deployments are not substitutes. Browser
authentication, repository/App administration, and deployment provisioning remain
external prerequisites where the existing approved configuration cannot resolve
them. Continue independent source work while those prerequisites are pending.

## Validation

Current main includes a cumulative WorkOrder allocation helper and exported
atomic inference-ledger functions from PRs #184 and #185. A separate shared-ledger
continuation owns immutable intent, receipt, reconciliation, and outcome identity.
Fab does not duplicate or replace that implementation. The incoming Bedrock
bridge is bound to the separate codex/bedrock-v1 Docker tuple; it is not an
enrollment grant for Fab's persistent-worker adapter. Its exact tuple checks
remain intact. A program spanning multiple WorkOrders still requires immutable
sub-budgets totaling at most $5 or one shared canonical program budget before
live execution.

Focused provider tests cover message/tool continuity, exact profile/region binding,
missing usage, unsupported blocks, bounded outputs, cancellation/timeout, error
redaction, observer failure, and zero retries. Integration tests must additionally
prove durable reserve-before-dispatch, current Attempt/lease authority, unchanged
request digest, and retained liability for unknown outcomes. Offline controls are
reported separately from live provider and deployed qualification.

## Primary references

- [AWS Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [AWS CountTokens](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_CountTokens.html)
- [AWS Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)

Converse accepts inference profiles. CountTokens documents an input count matching
the equivalent inference request. AWS documents automatic SDK retries for some
errors; the actual transport must override that behavior and prove one attempt.
