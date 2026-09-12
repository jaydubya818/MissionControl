# Runtime contract v50 → v51: exact public diff

Runtime v51 is additive. It introduces exactly eight public operations and
removes or changes no v50 operation. Runtime v50 belongs to the inference
observation-retention merge on authoritative main. The incident draft's opaque
`controlReferences` field was never on main and is not part of v51.

Shared validators used below:

- `EvidenceRef`: `{ kind, recordId, relationship, subjectDigest? }`.
- `ControlExecution`: `{ controlKey, commandReceipt: EvidenceRef,
  observedEffectReceipt: EvidenceRef, observedAt }`.
- A control command/effect receipt must be a canonical `EVIDENCE` envelope in
  the incident project with `result=PASS`. Its `checkId` must be
  `factory-control:<controlKey>:command` or
  `factory-control:<controlKey>:effect`, respectively. The two record IDs must
  differ, both records must be created after the current phase entry and before
  `observedAt`, and `observedAt` must be current for the incident.

## `factory/incidents:list` — added query

- Arguments: `projectId`, optional status filter, optional bounded limit.
- Result: up to 100 incident aggregate documents for the authorized project.
- Schema impact: reads new `factoryIncidents` indexes by project/status.
- Reason: operator queue and refresh-safe reconstruction.
- v50 relationship: no incident query existed; existing alerts/events remain
  unchanged and are not copied.

## `factory/incidents:get` — added query

- Arguments: `incidentId`.
- Result: `{ incident, transitions, proposals }` for the authorized workspace.
- Schema impact: reads the three new incident tables by incident identity.
- Reason: reconstruct one durable command workspace without a second evidence
  warehouse.
- v50 relationship: additive read; existing Attempt, alert, evidence, and audit
  records stay authoritative.

## `factory/incidents:create` — added mutation

- Arguments: `projectId`, optional `repositoryId`, SHA-256 source fingerprint,
  title, summary, severity, optional commander identity, business impact,
  recovery objective, evidence refs, idempotency key.
- Result: `{ incident, created }`.
- Schema impact: inserts `factoryIncidents`, the immutable Clarify transition,
  and an existing `activities` audit record.
- Reason: file one scoped canonical incident from human intent.
- v50 relationship: additive; it does not mutate an alert, WorkOrder, Attempt,
  release, grant, route, or evidence record.

## `factory/incidents:advance` — added mutation

- Arguments: `incidentId`, `expectedSequence`, exact next phase, reason,
  evidence refs, bounded containment actions, control executions, optional
  `restoreAuthority`, idempotency key.
- Result: `{ incident, transition, duplicate }`.
- Schema impact: appends `factoryIncidentTransitions`, updates only the incident
  projection, and appends an existing `activities` audit record.
- Reason: enforce the exact sequential lifecycle and make command issue,
  observed effect, restoration authority, and resolution distinct decisions.
- v50 relationship: additive. It invokes no second state machine and cannot
  restore or mutate v50 grants, credentials, routes, WorkOrders, or Attempts.

## `factory/incidents:assignCommander` — added mutation

- Arguments: `incidentId`, `expectedSequence`, named commander actor ID,
  reason, idempotency key.
- Result: `{ incident, duplicate }`.
- Schema impact: appends an immutable commander transition and updates the
  incident projection.
- Reason: containment cannot proceed without explicit human ownership.
- v50 relationship: additive; existing identity and workspace authorization
  supply actor authority.

## `factory/incidents:decideProposal` — added mutation

- Arguments: `proposalId`, `ACCEPTED|REJECTED`, reason.
- Result: the immutable decided proposal document.
- Schema impact: updates only `factoryIncidentProposals` and appends audit.
- Reason: agents/services remain advisory; accepting a proposal does not
  execute a control or advance the incident.
- v50 relationship: additive and reuses `factory.approve` authorization.

## `serviceCommands:fileFactoryIncident` — added action

- Wire arguments: signed service-command `envelope`, canonical `payloadJson`.
- Authorized payload: exact project/repository scope, source fingerprint,
  title, summary, severity, business impact, recovery objective, evidence refs,
  and optional agent ID.
- Result: the created or idempotently existing incident document.
- Schema impact: records the existing replay-resistant service-command receipt,
  then inserts an agent/service Clarify incident and transition.
- Reason: permit signed detection without granting incident command authority.
- v50 relationship: additive `incidents.detect` capability using the existing
  service-command authorization, digest, currentness, and replay controls.

## `serviceCommands:proposeFactoryIncidentAction` — added action

- Wire arguments: signed service-command `envelope`, canonical `payloadJson`.
- Authorized payload: `incidentId`, proposal kind, summary, evidence refs,
  bounded containment actions.
- Result: the created or idempotently existing proposal document.
- Schema impact: records the existing service-command receipt and inserts
  `factoryIncidentProposals` only.
- Reason: let agents/services propose enrichment, containment, or corrective
  work without executing controls, restoring authority, or resolving.
- v50 relationship: additive `incidents.propose` capability using v50 service
  command boundaries.

## Schema and generated API impact

- Adds `factoryIncidents`, `factoryIncidentTransitions`, and
  `factoryIncidentProposals` with project/incident/idempotency indexes.
- Keeps legacy `controlReferences` optional and read-only so historical local
  qualification rows remain inspectable; every v50 write emits structured
  `controlExecutions` and never emits the legacy field.
- Extends existing service-command capability validation with exactly
  `incidents.detect` and `incidents.propose`.
- Adds no agent/service capability for containment execution, restoration, or
  resolution.
- Authoritative `convex codegen` completed against the isolated local backend.
  The checked-in generated binding already derives module exports and required
  no hand edit or additional generated diff after the final validator change.
