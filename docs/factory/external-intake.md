# External work intake

The intake adapter creates scoped Mission drafts from eligible GitHub issues and
signed application-error reports. It uses existing Mission planning, plan
approval, WorkOrder, Attempt, verification, and release APIs for subsequent work.
Event acceptance and application delivery have separate states.

This adapter is inactive until an authenticated operator configures an enabled
repository policy. This change does not install an external monitoring connector
or register a provider webhook.

## Repository policy

`factory/intake:configure` requires authenticated `factory.automation.manage`
authority. Anonymous demonstration context is insufficient. The policy includes
the owner, active team membership, active repository code scopes, per-Mission
budget, corrective-iteration bound, and hourly Mission creation bound.

The maximum configurable budget is USD 1,000 per Mission, three corrective
iterations, and 20 new Missions per hour. These are intake ceilings. Existing
planning, execution, accounting, and admission policies still apply.

The GitHub section names a required label and explicit numeric GitHub actor IDs.
It requires a connected, recently verified installation with `issues:read` and
the `issues` event subscription. The authorized policy sets the installation's
`issueIntakeEnabled` capability. Read-only issue access remains excessive under
the prior capability contract when this option is disabled. Issue write and
admin grants remain excessive in either mode. Reverify the installation after
changing its policy so repository readiness reflects the current capabilities.

For a clean setup, bind and verify the installation through the existing GitHub
App flow first. Before policy opt-in, its `issues:read` grant keeps the repository
degraded under the default capability contract. The verified installation record
remains connected, so an authorized operator can configure the policy and opt in
to the issue capability. Reverification then evaluates that explicit opt-in and
can mark the repository ready. Ingress and processing both require the repository
to be ready; configuration alone cannot make an unverified source operational.
The policy response's `githubProcessingReady` distinguishes configured intent
from current source readiness.

The product-error section names a unique connection key, allowed source actor
IDs, application, canonical environment, and secret environment-variable name.
The variable name must match `MC_PRODUCT_ERROR_WEBHOOK_[A-Z0-9_]{3,80}`. Secret
values stay in server configuration and are excluded from policy query results.
The product-error fields are optional when that source is disabled.

`factory/intake:disablePolicy` revokes new processing even when the former owner,
team, or installation can no longer satisfy setup requirements. Disabling the
policy does not cancel work that already entered the normal Mission lifecycle.

## GitHub issues

The existing `/github/webhook` route verifies GitHub's body signature, then
resolves the registered installation and repository. The issue adapter accepts
`opened`, `reopened`, and `labeled` events from allowed actors when the required
label is present. Bot senders, bot issue authors, and bodies containing the
`<!-- mission-control:factory-generated -->` marker do not initiate work.

The delivery ledger binds the exact body digest and source identifiers. Failed
processing or a five-minute expired processing lease can be retried by a matching
signed provider redelivery, up to three processing attempts. Changed bodies and
identities are rejected. A late completion from an older processing generation
cannot overwrite the newer attempt. Completed duplicate deliveries do not spend
another processing attempt. Failure history is retained.

Existing records that lack a body digest cannot acquire replay authority
retroactively. The route rejects those replays explicitly. Provider signatures
that fail verification do not reserve delivery IDs. The route accepts at most
1 MiB of UTF-8 body data.

## Application-error envelope

`POST /factory/product-errors` accepts a normalized envelope from an explicitly
configured monitoring adapter. This is not a native Sentry or Grafana payload.
The adapter must map the provider's application, environment, and release to
Mission Control's canonical records before sending the envelope.

Required headers are `x-mc-connection`, `x-mc-delivery`, `x-mc-timestamp`, and
`x-mc-signature`. The timestamp is a ten-digit Unix timestamp in seconds. The
signature is `sha256=` followed by the hex HMAC-SHA256 of this exact UTF-8 string.

```javascript
JSON.stringify([timestamp, connectionKey, deliveryId, rawBody])
```

The timestamp tolerance is five minutes. The signed array binds the connection,
delivery ID, timestamp, and exact body without ambiguous separators. Requests
are bounded to 64 KiB. Reusing a delivery ID with changed content is rejected.

The JSON body has these fields.

| Field | Meaning |
| --- | --- |
| `action` | `detected`, `recurring`, or `resolved` |
| `actorId` | Configured source actor ID |
| `application` | Configured application identifier |
| `environmentId` | Canonical environment ID |
| `releaseId` | Canonical deployed release ID for the repository and environment |
| `fingerprint` | Stable provider error identity |
| `severity` | `SEV1`, `SEV2`, `SEV3`, or `SEV4` |
| `title` | Nonempty title, at most 160 characters |
| `summary` | Nonempty diagnostic summary, at most 4,000 characters |
| `sourceUrl` | HTTPS provider issue URL |
| `diagnosticUrls` | At most ten HTTPS diagnostic references |
| `occurredAt` | Unix milliseconds, no more than seven days old or five minutes ahead |
| `factoryGenerated` | Optional feedback-loop suppression marker |

The stored snapshot excludes unrecognized payload fields. URL credentials are
rejected, and query strings and fragments are removed. Known credential and
private-key patterns are redacted from text. The sender remains responsible for
excluding personal data and unsupported sensitive content before transmission.
The adapter stores a hash of the raw body, not the raw body itself.

## Processing and correlation

Receipt stores `RECEIVED` and schedules an internal processor. The processor
checks the current policy, owner, team, code scopes, authorizer, source binding,
and release scope again. A single mutation writes the Mission, assignment,
Mission event, incident when applicable, and delivery linkage. Existing Convex
transaction semantics prevent a partially committed Mission/ledger pair.

A separate failure mutation retains an error code and schedules bounded retries.
After three failed processing attempts, the delivery remains `FAILED`. Duplicate
ingress does not keep scheduling work during the five-minute scheduling window.
`factory/intake:retryDelivery` lets an authorized automation operator recover a
received or failed delivery after that window, within the original attempt bound.

New issue events correlate with an active Mission. Reopening a terminal issue
can create a bounded follow-up. Product errors correlate with active repair work.
An increase in reported severity is retained as a correlation reason without
creating duplicate repair work or changing the incident's governed severity.
An occurrence after terminal work can create a regression Mission. Delayed
occurrences from before completion remain associated with the prior work. The
hourly bound counts actual Mission creation times, including delayed deliveries.

Application errors create canonical incidents in `CLARIFY` with affected-release
and repair-Mission references. `resolved` provider notifications remain evidence
of the provider's report and do not establish restoration or close the incident.

## Operator continuation

`factory/intake:listDeliveries`, `getPolicy`, and `getDelivery` require scoped
authenticated access. Delivery lists and detail reads both preserve Mission
record visibility. Unlinked pending or rejected source snapshots are visible
only to scoped automation operators who can manage the policy. Lists inspect
at most the requested 100 most recent records before filtering inaccessible
Missions, so a filtered result may contain fewer rows than the requested limit.
Its projection includes the canonical Mission, current Plan, WorkOrders, and
incident, with separate execution-started and acceptance-established fields.

`factory/intake:requestPlanning` calls the existing `missionPlanning.request`
entry point under the operator's identity. The existing worker admission,
planning feature flag, budget, source scope, and plan approval checks apply.
The resulting Mission is also available through the existing Missions page.
No provider request automatically approves a plan or starts a WorkOrder.

### Authenticated client examples

These examples use the application's authenticated Convex client, or a
`ConvexHttpClient` configured with an existing operator's valid access token.
All IDs must be selected from the same live workspace's canonical records. A
deployment administrator identity or an arbitrary actor string is not a
replacement for that operator session. The `api` object is the regenerated
`convex/_generated/api` export.

```typescript
const configured = await client.mutation(api.factory.intake.configure, {
  projectId,
  repositoryId,
  ownerMemberId,
  owningTeamId,
  codeScopeIds,
  enabled: true,
  githubEnabled: true,
  githubRequiredLabel: "factory-ready",
  githubActorIds: ["1234567"], // Replace with the approved GitHub actor ID.
  productErrorsEnabled: true,
  productConnectionKey: "todo-monitor",
  productSecretEnv: "MC_PRODUCT_ERROR_WEBHOOK_TODO",
  productActorIds: ["todo-monitor"],
  application: "todo-app",
  environmentId,
  budgetUsd: 10,
  maxCorrectiveIterations: 2,
  maxMissionsPerHour: 2,
});

// Uses the existing provider-verification action and existing App credentials.
await client.action(api.githubAppConnections.verifyInstallation, { repositoryId });
const policy = await client.query(api.factory.intake.getPolicy, { repositoryId });
// Display policy.githubProcessingReady before treating issue intake as available.

const deliveries = await client.query(api.factory.intake.listDeliveries, {
  projectId,
  limit: 50,
});
const status = await client.query(api.factory.intake.getDelivery, { deliveryId });
await client.action(api.factory.intake.requestPlanning, { deliveryId });
```

For issue-only intake, set `productErrorsEnabled: false`, use an empty
`productActorIds`, and omit the connection, secret reference, application, and
environment fields. For application errors only, set `githubEnabled: false` and
use an empty `githubActorIds`; keep a nonempty label value in the current policy
shape. Setting a source to disabled does not waive scope or budget validation.

Recovery and revocation use these separate mutations. Retry is available only
after the five-minute scheduling window and before the three-attempt ceiling.
The planning wrapper uses a stable Mission-bound idempotency key; generating a
new candidate after a failed planning run uses the existing Plan workspace.

```typescript
await client.mutation(api.factory.intake.retryDelivery, { deliveryId });
await client.mutation(api.factory.intake.disablePolicy, {
  policyId: configured.policyId,
});
await client.mutation(api.factory.intake.recordRestoration, {
  deliveryId,
  releaseId: verifiedRepairReleaseId,
  receiptId: postDeploymentBrowserReceiptId,
});
```

### Existing navigation integration

The existing Missions portfolio lists canonical intake Missions. Its detail
page at `/v2/missions/<missionId>` contains the Plan, Execution, and Work Orders
tabs. The Plan tab already invokes `missionPlanning.request`, presents its run
history, and retains the existing submit, approve, and release controls. The
incident can be inspected through the existing factory incident workspace.

| Integration point | Existing source or intake API |
| --- | --- |
| Missions portfolio | `src/eos/views/MissionPortfolioView.tsx` |
| Mission detail and Plan tab | `src/eos/views/MissionDetailView.tsx`, `MissionPlanWorkspace.tsx` |
| Intake policy editor in an existing section | `configure`, `getPolicy`, `disablePolicy` |
| Delivery list with canonical Mission links | `listDeliveries`, then `getDelivery` |
| Correlated planning request | `requestPlanning` |
| Failed delivery recovery | `retryDelivery` |
| Evidence linkage for application restoration | `recordRestoration` |

This backend change adds no new navigation route or policy-editor screen.
Policy setup, intake history, and recovery still need a small control in an
existing Missions or Learning section, or an authenticated operator client.
The emitted Mission's planning and execution are already reachable through
existing Mission navigation. Browser qualification of those paths remains open.

## Restoration evidence

`factory/intake:recordRestoration` requires factory approval authority and
preserves Mission record visibility. It links
an existing independently verified browser receipt to a verified repair release.
The release must belong to the delivery's repository and environment and a
WorkOrder of its repair Mission. The receipt must identify the deployed merge
commit, current WorkOrder revision, matching workflow run, and acceptance
criterion `product-error:<fingerprint>`. That criterion must exist on the
WorkOrder. The receipt must be current, passed, independent, and recorded after
both deployment and error receipt.

Recording this evidence does not change incident phase, containment state,
restoration authority, release approval, or Mission acceptance. The existing
incident and delivery APIs retain those decisions. A normal predeployment
candidate receipt cannot establish post-deployment restoration.

## Qualification boundary

The source tests exercise the registered handlers and HTTP route functions with
an in-memory database, real permission helpers, and real Web Crypto signatures.
The fixture emulates Convex mutation rollback and records scheduled work. It
does not prove deployment transaction behavior, provider delivery, or worker
execution. The planning action's downstream API boundary is controlled in this
suite; existing planner admission tests remain separate.

Live qualification requires an installed provider connection, configured secrets,
an authenticated operator session, an admitted worker, an independently verified
application candidate, and observed release restoration. None is claimed by the
local intake suite.
