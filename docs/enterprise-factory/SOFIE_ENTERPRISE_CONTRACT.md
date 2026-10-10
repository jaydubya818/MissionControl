# Sofie enterprise contract v1

This is an inactive, synthetic-only MissionControl integration candidate. MyEve and its external-alpha installations are unchanged. A real MyEve session, UI and canonical Result consumer are not qualified by the local fixture.

## Supported operations

| Caller | Operation | Effect |
| --- | --- | --- |
| Authenticated owner | `sofieEnterprise:connect` | One-hour maximum connection for the configured synthetic owner, development environment and current workspace membership |
| Sofie application | `enterprise.propose` | Immutable inspectable proposal, scoped by connection and stable owner-intent key |
| Authenticated owner | `sofieEnterprise:decide` / `AUTHORIZE_DRAFT` | Approves the exact proposal digest for draft creation only |
| Sofie application | `enterprise.submit` | Creates one canonical unscoped DRAFT; retries return the same Mission |
| Sofie application | `enterprise.read` | Current bounded Mission, Plans, WorkOrders, milestones, blockers, gate identity/reasons and Needs You projection |
| Authenticated owner | `sofieEnterprise:decide` / `REVOKE` | Revokes the proposal or connection; subsequent reads and retries fail |

The application cannot approve its own proposal, approve Plans, alter budgets, select or replace Factories, dispatch, settle, accept gates, publish, deploy or administer MissionControl. The existing unscoped Mission DRAFT form preserves the exact operator owner. Canonical governance assigns the complete member/team/repository/code scope later. Draft budget is zero and no accounting reservation is created.

## Authentication and replay

Use the existing `mc-service-command-v1` envelope with service identity `myeve-sofie-readiness-v1`, one of the three listed application capabilities, project ID, `connection:<id>` repository-scope field, command ID, issue/expiry times and exact payload digest. HMAC uses the dedicated `MC_SOFIE_APPLICATION_SECRET`, never the worker service key. `MC_SOFIE_APPLICATION_KEY_ID` binds connection key rotation; `MC_SOFIE_APPLICATION_OWNER_ID` pins the credential to one synthetic owner. `MC_SOFIE_READINESS_ENVIRONMENT_ID` must identify that project's synthetic development environment. Missing configuration denies access.

The application receives no owner JWT, admin token or unrestricted Convex capability. Owner decisions use the normal authenticated operator session. Application requests check current owner/tenant/team/role scope, connection/proposal revocation and expiration inside the same transaction as the effect. The approved content digest binds the exact connection, owner, tenant, project, intent key and proposal. Changed-payload key reuse fails. Concurrent same-intent requests produce one proposal; concurrent submissions produce one Mission. A lost response is reconciled by retrying the same intent and digest, never by starting execution.

## Read semantics and proof

A read binds the proposal's exact Mission ID. Optional expected Plan digest rejects stale reads once the caller has a revision. The response identifies the canonical Plan revision/status/digest and WorkOrder revision/Plan IDs. It exposes at most 20 Plan revisions, 100 WorkOrders and 100 handoff references and reports truncation. The current Plan takes precedence; before submission, the latest draft Plan is explicitly marked DRAFT and is not approval.

Quality Gate eligibility is recomputed by the existing canonical verification function. Its exact identity binds WorkOrder revision, verification contract, source Attempt and verification subject. No app-supplied Result, candidate, FactoryVersion, delegation or verification assertion is accepted. Existing execution and delegation validators retain those responsibilities. A bare Factory PASS is never enterprise acceptance.

Responses include observation time and a content digest and must travel over authenticated TLS in a future deployment. The digest detects accidental mismatch; it is not an independent signature or transferable Proof. Result/Proof output contains informational canonical handoff references only and always reports NOT_AVAILABLE with reason COMPLETED_RESULT_CONSUMPTION_NOT_QUALIFIED in this candidate. The local HR journey has no completed Result and reports NOT_AVAILABLE. Completed enterprise Result consumption by MyEve requires a later composed qualification against its canonical Result consumer. Existing accepted native/hybrid evidence is preserved and is not rerun or rebranded as MyEve evidence.

Needs You remains an owner decision. The app may present proposal digest, Plan ID/revision and required action; it may not answer the decision for the owner. Progress with no released WorkOrders displays that fact, not a fabricated percentage or success.

## Three-tier selection

The typed intent assessment recommends MissionControl only for a software initiative with at least two workstreams and enterprise governance needs. Bounded repository work remains MyFactory. Direct and multi-agent work without that enterprise need remains Sofie Native through its qualified local/cloud contracts. This assessment is advisory and cannot grant execution.

The deterministic scenario supplies explicit interpretation facts for “Build an Agentic HR platform.” No paid or natural-language model is invoked. The synthetic owner reviews the concrete proposal, authorizes draft creation, and receives actual canonical Mission and Plan status. This is protocol/journey preparation, not a claim that MyEve's production conversation router supports MissionControl.
