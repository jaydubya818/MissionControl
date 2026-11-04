# Sofie enterprise contract v1

This is an inactive, synthetic-only MissionControl integration candidate. A separate inactive MyEve consumer branch now composes the actual tool and Action Gateway against this protocol. External-alpha installations remain unchanged. Browser/session issuance and completed canonical Result consumption are not qualified by the local fixture.

## Supported operations

| Caller | Operation | Effect |
| --- | --- | --- |
| Authenticated owner | `sofieEnterprise:connect` | One-hour maximum connection for the configured synthetic owner, development environment and current workspace membership |
| Sofie application | `enterprise.inspect` | Read current exact proposal authorization/Mission binding by proposal ID or intent key; no proposal creation or approval |
| Sofie application | `enterprise.propose` | Immutable inspectable proposal, scoped by connection and stable owner-intent key |
| Authenticated owner | `sofieEnterprise:decide` / `AUTHORIZE_DRAFT` | Approves the exact proposal digest for draft creation only |
| Sofie application | `enterprise.submit` | Creates one canonical unscoped DRAFT; retries return the same Mission |
| Sofie application | `enterprise.read` | Current bounded Mission, Plans, WorkOrders, milestones, blockers, gate identity/reasons and Needs You projection |
| Authenticated owner | `sofieEnterprise:decide` / `REVOKE` | Revokes the proposal or connection; subsequent reads and retries fail |

The application cannot approve its own proposal, approve Plans, alter budgets, select or replace Factories, dispatch, settle, accept gates, publish, deploy or administer MissionControl. The existing unscoped Mission DRAFT form preserves the exact operator owner. Canonical governance assigns the complete member/team/repository/code scope later. Draft budget is zero and no accounting reservation is created.

## Authentication and replay

Use the existing `mc-service-command-v1` envelope with service identity `myeve-sofie-readiness-v1`, one of the four listed application capabilities, project ID, `connection:<id>` repository-scope field, command ID, issue/expiry times and exact payload digest. HMAC uses the dedicated `MC_SOFIE_APPLICATION_SECRET`, never the worker service key. `MC_SOFIE_APPLICATION_KEY_ID` binds connection key rotation; `MC_SOFIE_APPLICATION_OWNER_ID` pins the credential to one synthetic owner. `MC_SOFIE_READINESS_ENVIRONMENT_ID` must identify that project's synthetic development environment. Missing configuration denies access.

The application receives no owner JWT, admin token or unrestricted Convex capability. Owner decisions use the normal authenticated operator session. Application requests check current owner/tenant/team/role scope, connection/proposal revocation and expiration inside the same transaction as the effect. The approved content digest binds the exact connection, owner, tenant, project, intent key and proposal. Changed-payload key reuse fails. Concurrent same-intent requests produce one proposal; concurrent submissions produce one Mission. A lost response is reconciled by retrying the same intent and digest, never by starting execution.

## Read semantics and proof

A read binds the proposal's exact Mission ID. Optional expected Plan digest rejects stale reads once the caller has a revision. The response identifies the canonical Plan revision/status/digest and WorkOrder revision/Plan IDs. It exposes at most 20 Plan revisions, 100 WorkOrders and 100 handoff references and reports truncation. The current Plan takes precedence; before submission, the latest draft Plan is explicitly marked DRAFT and is not approval.

Quality Gate eligibility is recomputed by the existing canonical verification function. Its exact identity binds WorkOrder revision, verification contract, source Attempt and verification subject. No app-supplied Result, candidate, FactoryVersion, delegation or verification assertion is accepted. Existing execution and delegation validators retain those responsibilities. A bare Factory PASS is never enterprise acceptance.

Proposal/status responses include an observation time and content digest; that digest is not an independent signature. The status operation returns informational handoff references and NOT_AVAILABLE with reason COMPLETED_RESULT_REQUIRES_SCOPED_READ. Completed consumption is provided separately by the authenticated scoped Result operation documented below. Prior native/hybrid evidence remains historical; the new consumer qualification records a new actual deterministic journey rather than rebranding the historical evidence.

Needs You remains an owner decision. The app may present proposal digest, Plan ID/revision and required action; it may not answer the decision for the owner. Progress with no released WorkOrders displays that fact, not a fabricated percentage or success.

## Three-tier selection

The typed intent assessment recommends MissionControl only for a software initiative with at least two workstreams and enterprise governance needs. Bounded repository work remains MyFactory. Direct and multi-agent work without that enterprise need remains Sofie Native through its qualified local/cloud contracts. This assessment is advisory and cannot grant execution.

The deterministic scenario supplies explicit interpretation facts for “Build an Agentic HR platform.” No paid or natural-language model is invoked. The synthetic owner reviews the concrete proposal, authorizes draft creation, and receives actual canonical Mission and Plan status. This is protocol/journey preparation, not a claim that MyEve's production conversation router supports MissionControl.

## Consumer preflight and uncertain delivery

The inactive consumer performs authenticated `enterprise.inspect` before Action admission. An unapproved submit is denied without creating an uncertain remote write. Inspection rechecks current connection and proposal revocation even for a completed local tool replay. `enterprise.inspect` accepts exactly one selector (intent key or proposal ID); missing ID, foreign owner and changed proposal content deny. A missing intent returns null and is not proof that an in-flight write cannot still complete.

Lost submission acknowledgments remain UNKNOWN in the canonical MyEve Action Gateway. Sofie can inspect the exact proposal and read its canonical Mission without resending the submit. No execution or spending is dispatched during reconciliation. Gateway cached receipts must pass response validation again before presentation; stale, altered or redacted receipts are not accepted as the original observation.

## Completed Result read candidate

The additive `enterprise.result` operation accepts only Mission identity and the exact approved Plan digest. A separately owner-authenticated `connect` call may bind one Mission and its approved Plan; the application cannot create or alter this read scope. Existing draft connections have no Result scope. Revocation and current owner, tenant, team membership and role checks apply on every read.

This operation projects existing canonical Mission acceptance, current independent WorkOrder verification, criterion receipts, handoffs and executed accounting settlement. It does not persist another Result lifecycle or use stored gate projections as authority. Nonempty complete approved-plan coverage and current independent evidence are required. Any missing/stale coverage returns NOT_AVAILABLE / NOT_ESTABLISHED. Owner acceptance is reported separately. Native and delegated artifacts retain their existing synthetic qualification classification; this endpoint cannot establish production acceptance.

Result envelopes add HMAC-SHA256 authentication over the canonical digest of the response envelope and request binding (command ID, request payload digest and expiry). The configured application secret is used only inside the isolated integration. This is authenticated application readback, not an offline third-party attestation: a secret-holding application is itself within the trust boundary. The response expires no later than its inspected custody evidence. Consumers must perform a fresh read on reconnect and must not infer sustained validity from an old receipt. No credentials or artifact content are returned.

The MyEve Result adapter uses a new server-generated read-observation target and Action key for every call. This preserves durable audit and owner admission while avoiding cached PASS and allowing a new read after an UNKNOWN read acknowledgment. Mutation duplicate/UNKNOWN fences remain unchanged. Signed receipts that the gateway alters through redaction or truncation fail validation rather than weakening authenticity.

The optional fixed Result-consumer hook in `native-successor-journey.mts` invokes the MyEve test module against the actual completed hybrid Mission before cleanup. It does not rewrite Mission owners or manufacture Results. Golden Journey remains responsible for browser composition, release gates, canonical principal migration and adoption of these source candidates.
