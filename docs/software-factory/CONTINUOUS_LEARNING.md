# Governed Continuous Learning

## Purpose

Mission Control's Software Factory is a governed recursive self-improvement
(RSI) and continuous-learning system. It can research operator-approved
evidence, verify claims, recommend changes, implement approved work, validate
the result, measure the outcome, and propose the next bounded iteration.

External content is evidence, not authority. A source cannot approve a change,
change factory policy, dispatch implementation work, or write to a repository.
All material changes continue through the canonical hierarchy:

`Mission -> WorkOrder -> Task -> Attempt -> evidence -> pull request -> release`

## Current production boundary

The governed manual path is live for public Web/RSS sources. The Research
Watchlist can manage source authority, run one bounded fetch on demand, persist
the retained artifact and provenance-linked observations, checkpoint the
provider cursor only after evidence is durable, and obtain an independent
integrity receipt. An operator can then seed one frozen Loop Engineering
Research Brief from that exact verified source run and explicitly dispatch a
read-only `continuous-research` workflow. That workflow gives a bounded packet
of exact observation and artifact IDs to one claim extractor, then requires a
separate Evidence Reviewer to approve or reject every cited claim. The first
live proof completed over 20 frozen observations: the extractor submitted seven
claims, the independent verifier accepted six and rejected one, and the
projector produced no recommendations or downstream work.

The system does **not** poll providers, run a continuous schedule, treat an
integrity receipt as claim acceptance, perform broad discovery from the frozen
graph, automatically generate recommendations, dispatch implementation work,
or write to a repository from external research evidence.

This separation is deliberate. The manual claim boundary and its operational
recovery controls are now proven end to end. The workflow executor atomically
claims one run, fences state writes to the active lease, checkpoints the exact
step/retry/task cursor, renews ownership through heartbeats, recovers one stale
owner only from a matching checkpoint, and quarantines a second stale loss.
Admission reserves per-run and daily budget and enforces workspace concurrency.
The shared operator control supports `NORMAL`, `PAUSED`, `DRAINING`, `KILLED`,
and `QUARANTINED` modes.

The 2026-08-12 Research Lab canary retained four canonical WorkflowRuns and
independent verification receipts. It proved duplicate-claim rejection,
workspace concurrency denial, timeout and checkpoint-linked retry, pause and
drain heartbeat directives, budget denial and budget stop, one stale recovery,
repeated-stale quarantine, a canary-scoped kill acknowledgement, final lease
release, and restoration to `NORMAL`. Scheduled admission was separately
rejected with `continuous-scheduling-disabled`.

## Source authority contract

Every `researchSource` belongs to exactly one tenant and workspace. It records:

- an exact kind and operator-entered locator;
- a canonical URL and stable provider identity after validation;
- an owner and immutable source version;
- the named adapter, adapter version, and authentication mode;
- cadence, timezone, freshness target, item cap, monthly spend ceiling, and
  retention period;
- allowed content classes and explicit exclusions;
- provider cursor and cache metadata reserved for a later adapter;
- validation, policy review, failure, retry, and deletion-request state;
- created/updated actor and timestamps; and
- a mutation idempotency key.

The registry stores no credentials or access tokens. The manual Web/RSS adapter
retains bounded excerpts in governed run artifacts and observations according
to the recorded rights and retention policy. Future authenticated adapters may
reference secrets through the platform secret store; they must never copy
secret values into source records, events, logs, or artifacts.

`researchObservations` is the provenance boundary. Every observation links the
source, exact source run, retained run artifact, and independent integrity
receipt; preserves provider item identity and content hash; records trust,
safety, extraction, verification, rights, sensitivity, and retention
decisions; and supports deduplication and purge indexes. Safe observations
enter a new Research Brief as `PENDING` claim review. Quarantined or rejected
observations remain rejected and retain their reason.

## Lifecycle

| State | Meaning | Allowed next action |
| --- | --- | --- |
| Draft | Locator and policy envelope exist; no authority granted | Validate or retire |
| Verified | Deterministic validation produced an activatable canonical identity | Approve policy, activate, revalidate, or retire |
| Active | The exact source is authorized within its recorded limits | Pause or degrade/revoke through a trusted control |
| Paused | Authority is intentionally stopped | Resume if all gates still pass, degrade, revoke, or retire |
| Degraded | A credential, provider, or policy exception quarantined authority | Pause for review, revoke, or retire |
| Revoked | Authority was withdrawn by a trusted control | Retire |
| Retired | Terminal audit state | None |

Lifecycle mutations and their event insertions share one Convex transaction.
Every event records tenant, workspace, source, source version, actor, reason,
policy version, state transition, timestamp, and an idempotency key.

## Operator flow

The Watchlist lives inside **Intelligence -> Loop Engineering**. It is not a
new primary navigation domain.

1. Select **Add source**.
2. Choose RSS/Atom, website, X creator, or YouTube channel.
3. Enter the exact public locator and inspect the canonical-target preview.
4. Set cadence, timezone, freshness, item, spend, retention, allowed-content,
   and exclusion limits.
5. Create the governed draft. No network request is made.
6. Validate the source. Public website and feed URLs can become `VERIFIED`. X
   handles and YouTube handles remain drafts until a provider adapter
   resolves a stable provider ID. An exact YouTube channel-ID URL may verify.
7. A role with `factory.automation.manage` explicitly approves the policy.
8. Activate the authority, or pause/retire it. Activation does not start a
   schedule.
9. Select **Run once** to execute one capped Web/RSS fetch and inspect its
   immutable attempt, artifact, observation, cursor, and receipt lineage.
10. On a verified run, select **Start research brief** to create one bounded
    Loop Engineering cycle from the exact retained observation set. This does
    not accept claims or authorize repository changes.
11. Review the frozen evidence count and select **Dispatch evidence graph**.
    Mission Control revalidates the exact source runs, observations, artifacts,
    receipts, content hashes, safety state, and workspace before dispatch.
12. The Research Scout emits exactly cited claims or an explicit no-evidence
    result. A distinct Evidence Reviewer must approve or reject each claim.
    Accepted claims advance only to recommendation drafting; they do not create
    a recommendation or authorize a change.

## Authorization and tenant isolation

Every public query and mutation calls the existing workspace permission
boundary before reading or changing source data:

- `factory.read` lists, previews, reads, and audits;
- `factory.improve` creates and validates drafts or records a deletion request;
- `factory.automation.manage` approves, activates, pauses, resumes, and retires.

Source reads then compare the stored workspace ID with the requested workspace
ID. Mismatches return one generic unavailable-or-unauthorized error. Browser
actor labels never determine authority or audit attribution.

Internal credential and policy-drift controls are not public mutations. They
move active or paused authority to `DEGRADED`, retain the exception, increment
the failure counter, and prevent resume while an exception is unresolved.

## Network and provider safety

Phase 1 preview is deterministic and performs no network request. It rejects:

- non-HTTPS URLs;
- embedded credentials or secret-like query parameters;
- non-standard ports;
- localhost, local/private suffixes, and IPv4/IPv6 loopback, private,
  link-local, documentation, reserved, multicast, and non-routable literals;
- malformed or unsupported X and YouTube locator shapes.

The preview records an exact host allowlist. The manual Web/RSS adapter resolves
every DNS answer, rejects private/reserved destinations, pins the approved
public destination for the request, limits response size and duration, checks
every redirect against the allowlist, honors provider policy and robots rules,
and fails closed on ambiguity.

## Deliberate exclusions

- No continuous timer or provider polling.
- No source self-approval.
- No claim acceptance without a distinct verifier, and no automatic
  recommendation generation.
- No repository writes or automatic implementation.
- No provider credentials in source data.
- No unverified X/YouTube handle activation.
- No unbounded raw fetched-content store.
- No learning claim without cited, retained, independently reviewed evidence.

## Next safe phase

The next gate is an activation audit, not immediate recurrence. A scheduled
dispatcher must use a signed service identity, submit `dispatchMode:
"SCHEDULED"`, inherit the exact workspace policy, and prove fail-closed behavior
under process restart and multi-worker contention. The Product Owner must then
explicitly approve a one-source, one-workflow canary before
`continuousSchedulingEnabled` can change from `false`.

Recommendation drafting remains a separate read-only proposal slice over the
six accepted claims. It must add no source discovery, self-approval,
implementation authority, provider polling, or repository writes. The broad
`loop-engineering` graph remains outside the frozen-evidence dispatch boundary.

Evidence for the completed control proof is recorded in
[`2026-08-12-workflow-recovery-controls.md`](../testing/evidence/governed-continuous-learning/2026-08-12-workflow-recovery-controls.md).

See the [Loop Engineering contract](LOOP_ENGINEERING.md) and the
[governed continuous-learning implementation plan](../plans/2026-08-08-feat-governed-continuous-learning-plan.md).
