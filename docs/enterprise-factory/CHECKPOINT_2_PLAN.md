# Enterprise integration readiness

Accepted execution source remains 08daed6f5745dce00d18da4218a26fdc5b827666. Runtime source, image and historical evidence remain frozen. This checkpoint prepares integration without production execution.

## Workflow and evidence

1. Reconcile exact canonical main and dependency PR heads. Record ancestry, contract files, qualification evidence and required requalification.
2. Verify retained runtime bytes. Prepare a private registry publication request, digest-preserving transfer recipe, retention policy and retrieval verifier. Do not publish without registry/credential authorization.
3. Define the Sofie intake and status contract. Reuse canonical Mission draft persistence and governance. Application authentication is independent of owner approval. Allow only proposal preparation, authorized draft submission and scoped reads.
4. Run deterministic enterprise recognition, inspectable proposal, owner approval and duplicate-safe draft creation against real disposable storage. Plans and WorkOrders are read from canonical records; pending gates and unavailable Results remain explicit. No planner, producer or model is invoked.
5. Test malformed requests, revocation, expiry, cross-owner/tenant, stale revisions, concurrent submissions and lost responses. Run fresh-clone affected suites, CI, Bedrock comparison and independent security review.
6. Commit, push and verify exact remote SHA. Preserve all artifacts and disclose remaining adoption/publication boundaries.

## Domain and authority

The data shape is an application connection owned by one active operator, and an immutable Mission proposal with an exact digest and separate owner authorization. These are intake records, not another Mission lifecycle. Mission creation uses the existing canonical DRAFT validation and persistence function. Intake creates the existing unscoped DRAFT form with the exact operator owner. Full owner/team/repository/code scope is assigned later through canonical governance. No execution policy, spending grant, Factory version, Plan approval, dispatch, gate acceptance or administrative capability is exposed.

A dedicated application credential signs the existing service-command envelope with a dedicated service identity and capabilities. It is not the orchestration worker credential. Connection ID, project, operation and payload digest are signed. The application key is pinned to one configured synthetic owner; it cannot traverse other owners' connections. The mutation rereads the current connection and approval inside its transaction. Owner-facing approval uses normal authenticated workspace permissions and exact owner identity. Application requests never carry an owner JWT or admin credential.

Read projections bind exact Mission/Plan/WorkOrder and verification identities, include observation time and a content digest, and are authenticated by the application response. They carry no transferable offline signature claim. Current gate results come from canonical verification logic, not an app assertion. A read snapshot is not execution authority. Reads are bounded and report truncation; absent evidence stays unavailable.

## Deliberate scope

Three tiers remain separate: native direct/multi-agent, bounded MyFactory, and enterprise MissionControl. A deterministic intent assessment recommends enterprise proposal only for multi-workstream governed software initiatives. MyEve's persisted route enum is unchanged. Its external-alpha release is untouched. No MySkills runtime is adopted while its platform dependencies remain unmerged.

The chosen design is a narrow application endpoint backed by canonical storage. Exposing existing administrative APIs or impersonating the owner was rejected because either gives the app unnecessary authority. Implementation is sequential under the user's AGENTS tool mapping; independent read-only review supplies review separation. No irreversible architecture or deployment decision is made.

## Throughput checkpoint

- Blocking first steps: source and registry authority checks precede integration changes.
- Independent workstreams: source reads may run in parallel; writes remain sequential.
- Shared mutable state: one MissionControl checkout and one disposable database at a time.
- Smallest safe decomposition: one implementation owner; read-only independent security review after tests.
