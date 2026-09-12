# Durable accounting delivery contract

Status: implementation in progress under todo 063 and the cumulative capability
convergence program. This contract is not qualification evidence. Baseline:
reviewed observation-retention implementation `c5cbf718eb73ce70154ee7650ce13c1da826234f`;
its source PR and clean-main qualification remain the integration dependency.
It authorizes no provider calls, deployments, releases, or historical rewrites.

Implementation checkpoint: journal/delivery and diagnostic source is being
qualified offline. Startup wiring, settlement-only typed error wrappers, and
the bridge's acknowledged-incident diagnostic correction remain unapplied after
automatic approval review rejected those changes. This contract states intended
behavior; it does not establish integrated operation or release readiness.

## Outcome and boundary

Persist a known provider observation on the orchestration host before its first
normal settlement attempt. Deliver that exact observation to the existing
canonical accounting mutation after a process restart, including when the
Attempt, lease, worker, or live-call grant can no longer authorize execution.

The journal delivers accounting evidence. It grants no inference, reservation,
claim, renewal, replacement Attempt, correction authority, budget increase,
capacity return, or spending-fence removal. Recovery must have zero provider
sends and zero new holds or execution claims. Existing canonical reservation,
hold, receipt, usage-event, and reconciliation records remain the financial
authority. Local delivery state is not a second balance.

The guarantee starts after an observation file and its directory entry have
successfully synchronized to qualified local storage. It requires retention of
that storage, the canonical historical records, and valid service accounting
authentication. It does not recover a provider response lost before capture.

## Existing integration points

- `bedrockInferenceBridge.ts` already constructs a bounded original
  `BedrockSettlementPayload` and exposes it in `BedrockSettlementError` after a
  known result cannot be settled. It currently retains this payload in memory.
- `dockerSandboxProvider.ts` currently reduces that error to a message in
  `frameFailure`; `fetchDiagnostics` has no accounting reference.
- `FactoryAttemptWorker.tick` only runs when execution is enabled and enumerates
  PENDING/RUNNING runs. Its report callback requires a healthy current lease.
  Neither is a suitable prerequisite for accounting recovery.
- `index.ts` currently constructs the qualified provider transport during
  module initialization. Invalid or expired execution configuration must not
  prevent accounting-only startup.
- `serviceCommands:recordProviderUsage` uses `provider-liability.settle` and
  invokes `factory/providerLiability:recordUsageInternal`. The latter validates
  the original hold, Attempt, lease/generation, request/profile, and price.
Current execution eligibility is deliberately absent from this path.
- A service-command receipt contains a payload digest and status, not the
  observation. Its status alone cannot establish whether accounting committed:
  the accounting mutation can commit before action completion or reply fails.

## Host configuration and lifecycle

Use one explicit `MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR` per orchestration host
and backend/project/repository scope. It must be an absolute path on persistent
local storage outside the repository checkout, disposable Attempt directories,
container filesystem, and OS temporary directories. There is no automatic
temporary-directory, working-directory, or home-directory fallback.

Use existing `CONVEX_URL`, `CODEX_WORKER_PROJECT_ID`, and
`CODEX_WORKER_REPOSITORY_ID` for the scope. Read those IDs independently of
execution flags. Use existing service authentication and signing configuration;
never persist secrets or signed envelopes. Root metadata pins the normalized
backend URL and exact IDs; opening the directory under a different scope fails
closed. Records cannot select another server, project, or repository. Service
credential rotation does not change historical payload identity.
Reject backend URLs containing user information, query strings, or fragments;
configuration must not turn a credential-bearing URL into journal metadata.
Require a canonical root HTTPS origin. HTTP is allowed only by an explicit
loopback fixture injection. The dedicated client may POST only to that pinned
origin's `/api/action`; reject redirects and non-root configured paths.

Configuring the directory enables accounting capture and delivery. There is no
second switch tied to provider execution. New composed provider execution must
fail before reservation/send if the configured durable journal is absent or
unhealthy. Explicit test doubles remain test evidence and cannot satisfy host
durability qualification.

Initialize the journal and delivery worker before optional provider transport
construction and worker registration. Keep this startup outside the execution
enablement and adapter-health branches. If provider configuration is invalid or
expired, execution remains disabled while accounting delivery starts. Delivery
must not load a provider grant, provider credentials, Docker, an executor,
worker registration, or a live route to construct its client.
Isolate the early optional adapter loader as well as provider configuration.
Invalid optional configuration disables its execution path and records a safe
code; it cannot terminate accounting-only startup.

Missing or invalid service accounting credentials suspend delivery visibly and
retain all entries; they never authorize bypass. Operators can restore those
credentials without enabling execution. Stopping execution flags must not stop
the accounting worker. Process shutdown stops new passes, aborts its bounded
HTTP request, and leaves unacknowledged entries for the next startup.

## Bounded storage and immutable capture

Use a small filesystem journal, with no new database dependency:

```text
journal.json
entries/0000/intent.json
entries/0000/observation.json
entries/0000/ack.json
entries/0000/delivery.json
... through entries/4095/
```

`journal.json` uses `factory-accounting-journal/v1` and is create-once metadata
containing journal ID and pinned scope. Directories are 0700 and files 0600,
owned by the orchestration UID. The
parent hierarchy must be administrator- or service-owned and not writable by
untrusted users. Canonicalize the configured path once; reject symlink traversal
inside the journal, non-directory components, changed root inode/device, and
unexpected permissions. Symlinks in trusted system path aliases may be resolved
before pinning the root; an untrusted ancestor cannot be made safe by `realpath`.

Before the original execution path requests a canonical request hold, allocate
one of 4096 fixed local capture slots with exclusive `mkdir`, create and fsync
its immutable `factory-accounting-capture-intent/v1` `intent.json`, and fsync the
relevant parent directories. This is
a storage ticket only; it grants no financial or execution authority. It binds
the journal scope, original settlement subject, request ID/digest, and bounded
evidence provenance. A failed preflight causes zero reservation and zero send.
No slot is reused or automatically deleted in this slice, even after delivery.
This deliberately imposes a finite retention horizon; archival/reclamation is
separate work. Capacity exhaustion blocks new capture and leaves delivery active.

The immutable observation contains only:

- Schema `factory-accounting-observation/v1`, journal ID, capture timestamp,
  pinned project/repository scope, and the matching intent digest.
- The exact original settlement subject: `reservationId`, `workflowRunId`,
  `leaseId`, `generation`.
- The exact original usage fields: `requestId`, `requestDigest`, `provider`,
  `model`, `providerRequestId`, `usageId`, `inputTokens`, `outputTokens`,
  `classification`, and `expectedReceiptRevision`.
- A canonical observation digest covering those fields, and bounded provenance
  that preserves the existing fixture/approved-qualification evidence class.

Use existing canonical hashing and strict usage validators without changing
their semantics. Capture ACTUAL observed usage, not billed monetary ACTUAL.
No amount is calculated locally. Preserve safe counters, identities and
original revision exactly. This capture slice requires the bridge's known-result
ACTUAL usage payload; an incomplete capture marker is never synthesized into
observed usage. No prompts, output text, request bodies, credential
material, authorization grants, signed commands, or arbitrary error objects.
Reject extra fields, unsafe counters, unknown schema, and oversized IDs before
writing. Bound observation JSON to 64 KiB; intent/ack to 8 KiB and delivery
status to 4 KiB. Bound generated temporary files to one per artifact per writer
and four fixed exclusive temporary names per artifact across restarts. A
retained failed temporary is not overwritten or removed by another writer;
exhaustion reports an exception rather than creating additional files.

After a provider result is parsed, set the existing known-observation variable
before attempting journal persistence. Build one frozen observation, write a
0600 exclusive no-follow temporary file in its slot, fsync the file, and close
it. Publish with an atomic create-without-replacement operation, then fsync the
slot directory. A same-filesystem hard link from the completed temporary file
to the final name provides create-without-replacement semantics; unlink the
temporary name and synchronize directory cleanup. A final-name collision must
validate identical bytes or report conflict; never overwrite an observation.
The existing `atomicWriteFile` fsync sequence is a reference, but its replacing
rename is suitable only for advisory delivery status, not immutable artifacts.

Only a successfully published and synchronized observation receives a durable
diagnostic reference. First settlement normally follows that point. If capture
fails after the result is known, block execution, retain the typed in-memory
payload, and attempt at most one bounded best-effort settlement of that exact
payload. Even if that write succeeds, do not return an inference success or
claim local durability. Report `ACCOUNTING_CAPTURE_FAILED`; never replace known
usage with an empty UNKNOWN payload. No automatic send retry is allowed.

No response parsing or captured payload may be silently truncated to fit the
journal. Oversize/corrupt records are retained as exceptions, not partially
delivered. In-flight storage exhaustion remains a possible capture failure;
the preflight ticket bounds record count but cannot guarantee against disk
failure or another process exhausting the filesystem.

## Observation, acknowledgment, and delivery status

The observation is immutable evidence. `delivery.json` uses
`factory-accounting-delivery-status/v1` and is an advisory status
snapshot containing bounded error codes, attempt count, last-attempt time, and
next eligible time. It contains no accounting values or replacement payload.
Atomic replacement of this file must not touch the observation or acknowledgment.
Competing status writes can affect diagnostics or retry timing only.

`ack.json` uses `factory-accounting-delivery-ack/v1` and is a separate create-once
artifact binding the observation digest,
original payload digest, acknowledgment time, and validated returned
`duplicate`/`incident` booleans. The existing mutation returns no receipt ID;
do not invent one. Acknowledgment is not inferred from HTTP status, a promise
resolving, service-command status, or a partial result. Both fields must be
actual booleans in the successful response to this exact submission.

All four boolean combinations acknowledge durable accounting delivery:

| Returned result | Delivery interpretation | Execution interpretation |
| --- | --- | --- |
| duplicate false, incident false | Recorded | Existing synchronous bridge success rules apply |
| duplicate true, incident false | Exact observation already recorded | No resumed or repeated execution |
| duplicate false, incident true | Recorded with an incident | Spending fence remains; no success promotion |
| duplicate true, incident true | Incident observation already recorded | Spending fence remains; no success promotion |

Persist acknowledgment with the same no-replacement/fsync procedure. A valid
ack always takes precedence over missing, older, conflicting, or later advisory
delivery status. No writer may downgrade or delete it. If another drainer wrote
an ack for the same observation, validate its binding and accept it; differing
timestamps or duplicate flags from a second valid response do not invalidate the
first acknowledgment. An ack for another digest or malformed ack is an integrity
exception, never evidence that this entry delivered.

Preserve the current stricter synchronous bridge policy: only its original
nonincident/nonduplicate settlement result can release the provider output.
An asynchronous acknowledgment does not make a failed Attempt successful,
return the output, restart the container, clear a fence, or change an outcome.

## Delivery passes and concurrency

Implement a separate host `AccountingDeliveryWorker` with a narrow dependency
that can only submit settlement. Its module must not import provider transport,
reservation, execution claim, or worker-renewal functions.

Run one pass at startup and then every 30 seconds. A pass has these fixed bounds:

- Inspect at most 128 fixed slots, with a rotating cursor so older acknowledged
  entries and blocked entries cannot permanently starve later pending entries.
- Submit at most 8 eligible observations, sequentially; stop after 30 seconds.
- Each submission has a deadline of min(10 seconds, remaining pass budget).
- Use one in-process single-flight pass guard. Stop starting submissions after
  shutdown or budget expiry. Do not overlap a timed-out request in that process.
- Retry transient/ambiguous delivery errors with bounded backoff: 30 seconds,
  60 seconds, 120 seconds, then at most once every 300 seconds per entry. A
  restart or competing advisory update may cause an earlier duplicate; it may
  not alter payloads or increase a pass's submission bound.

Use a dedicated `ConvexHttpClient` with the installed client's supported custom
`fetch` injection. Enforce timeout using an abortable HTTP fetch, including
response-body consumption, rather than only racing an unresolved action
promise. Timeout means outcome unknown: the server may still commit. Wait for
the local aborted request to settle before releasing its in-flight guard.
No provider grant or expired execution signal controls the accounting timeout.
Keep the deadline active through response-body consumption. Reject a response
larger than 64 KiB, cancel the reader on overflow, and use `logger: false` so
backend log lines cannot bypass sanitized accounting diagnostics.

For each eligible observation, validate root/intent/observation/ack again, then
call only `serviceCommands:recordProviderUsage` through a freshly signed
`provider-liability.settle` envelope. Generate a fresh command ID, issue time,
expiry, and signature each time using current service credentials. Preserve
the exact original business payload and `expectedReceiptRevision`; do not
increment the revision to overcome a rejection. Do not replay stored signed
envelopes or reuse their nonces. Tests must compare the business payloads across
deliveries separately from the intentionally different envelope metadata.
Use the same bounded settlement submission and acknowledgment helper for the
initial bridge delivery and later passes. A separate injected client for that
helper avoids changing timeout/auth state on the execution client. The bridge's
UNKNOWN fallback for an admitted call with no known result remains a separate
existing behavior; do not enqueue it as a fabricated captured observation.

Multiple drainers may deliver the same immutable entry. Canonical transaction
idempotency supplies one usage event/accounting effect. Immutable acknowledgment
publication prevents a late failing drainer from undoing success. This slice
does not add distributed delivery locks or claim host-global throughput across
an arbitrary number of processes: per-process passes are bounded and concurrent
duplicates are safe. Fixed exclusive capture slots enforce the storage-count
limit across processes. No process may steal a slot, delete another writer's
temporary file, or reset another observation after a guessed lock timeout.

The declared historical subject, receipt ownership, identity, and revision
conflicts become `BLOCKED_REVIEW`, retaining all evidence. Service
authentication/configuration failures suspend delivery until the service is
fixed. A network error, timeout, action-completion failure, or malformed reply
leaves the entry pending with bounded retry. Decode only explicit known backend
errors; do not use broad substring matches to classify arbitrary text as final.
The settlement-only typed boundary distinguishes stored historical
subject/identity/revision conflicts (`BLOCKED_REVIEW`) from service signing or
signed-command scope configuration failures (`SUSPENDED`). It preserves all
existing authorization, scope, replay and settlement rejection checks. Accept
only exact allowlisted code/reason data; unknown, replay and expiry errors stay
pending. Fixed-backend HTTP 401/403 failures before the action also suspend
delivery through a local safe error. Actual signed-action qualification must
prove the typed data survives the action/mutation boundary.
Persist safe error codes, never full backend errors or credentials. No automatic
operator correction, revision rebasing, or blocked-record rewrite is permitted.

## Restart validation and crash behavior

Enumerate fixed slot names, not arbitrary filenames supplied by records. Open
regular files without following symlinks; check ownership, mode, size, and
inode/type on the opened descriptor. Reject unexpected hard links in published
files after normal temporary cleanup. Handle an expected temporary/final link
pair from interrupted publication explicitly by comparing inode and bytes.
The storage threat boundary trusts the service UID and administrator; it does
not claim resistance to a compromised process that can rewrite all journal
files or steal the signing secret.

Ignore incomplete temporary files for delivery and retain them for inspection.
A complete temporary observation matching its intent may be republished on
restart only after strict validation, file fsync, exclusive final publication,
and directory fsync; this becomes a new successful capture point. Conflicting
temporary candidates or invalid final artifacts block that slot. Do not guess
which payload is right. Acknowledgment temporary files are never trusted as a
completed acknowledgment; retry the unchanged observation instead.

| Interruption | Required recovery |
| --- | --- |
| Before storage ticket is durable | No canonical reservation or provider send occurred |
| After ticket, before known result is durably captured | Retain incomplete capture marker; exact usage may be unavailable; original canonical hold remains conservative |
| During observation write/publication | Validate as above; never deliver partial bytes or fabricate counters |
| After capture, before first settlement | Startup pass delivers original observation |
| Before accounting mutation commits | Retry original payload with a fresh command |
| After mutation commit, before action completion or reply | Retry; canonical exact duplicate acknowledges delivery |
| After reply, before ack fsync | Retry; canonical exact duplicate acknowledges delivery |
| After ack fsync, before status update | Ack wins; do not submit again |
| During a concurrent drainer's failed status write | Preserve another drainer's valid ack |
| Host storage lost, required historical records deleted, or permanent service authorization loss | Delivery cannot be claimed; retain/report the limitation where evidence remains |

No automatic deletion or garbage collection runs in this slice. Incomplete,
blocked, and acknowledged slots all count toward the finite retention capacity.
Once full, the system continues bounded delivery and reports capture unavailable.
An explicit archival/reclamation procedure is a later operational dependency;
do not quietly drop acknowledged evidence to simulate unlimited uptime.

## Diagnostic propagation

Extend the typed bridge error with a bounded accounting reference:
`journalId`, slot ID, observation digest, and delivery state. Do not expose the
host path or settlement payload to the container. A capture failure has no
durable reference and must say so explicitly.

`DockerSandboxProvider.frameFailure` preserves this reference in its host-owned
record; `fetchDiagnostics` returns the sanitized reference and safe error code.
`RemoteSandboxRuntime` already collects diagnostics for its SANDBOX_FAILED event;
keep the reference through that path and existing metadata sanitization. The
lease-gated report remains best effort. If reporting fails because execution is
terminal, the local journal remains discoverable by its original scope/run and
the independent accounting worker continues. Do not renew a lease to publish a
diagnostic or require an Attempt report to acknowledge accounting.

Expose a bounded delivery-health summary in the existing orchestration status:
pending/blocked/incomplete/acknowledged counts, capacity state, last-pass time,
and safe last error. Mark sampled counts as sampled until a full fixed-slot scan
completes. No new primary UI, public payload endpoint, manual unfreeze action,
or generic journal browser is part of this implementation.

## Precise implementation scope

| File or module | Change |
| --- | --- |
| New `apps/orchestration-server/src/accountingDeliveryJournal.ts` | Strict versioned records, fixed storage slots, validation, immutable fsync publication, acknowledgment and advisory status |
| New `apps/orchestration-server/src/accountingDeliveryWorker.ts` | Bounded settlement-only passes, abortable accounting client, fresh signing, ack/error rules, health summary |
| New `apps/orchestration-server/src/accountingDeliveryRuntime.ts` | Testable explicit configuration and independent lifecycle composition; no execution flag or provider grant dependency |
| `apps/orchestration-server/src/bedrockInferenceBridge.ts` | Inject narrow capture/ack dependency; preflight ticket, known-result capture, bounded initial settlement, diagnostic reference; retain no-send-retry behavior |
| `apps/orchestration-server/src/bedrockFactoryComposition.ts` | Supply host journal to the existing bridge; no new route or authority |
| `apps/orchestration-server/src/dockerSandboxProvider.ts` | Preserve typed accounting reference through failure and diagnostics |
| `apps/orchestration-server/src/index.ts` | Independent storage/delivery startup and shutdown; isolate invalid optional execution configuration; existing status summary |
| `apps/orchestration-server/src/serviceCommandClient.ts` | Reuse existing signing unchanged unless a small typed settlement-only wrapper avoids duplication |
| `apps/orchestration-server/src/remoteSandboxRuntime.ts` and `convexRemoteSandboxJournal.ts` | Only if required to preserve sanitized reference in existing failure metadata; no new accounting authority |
| `apps/orchestration-server/src/factoryAttemptWorker.ts` | Expected no production change; regression proves terminal/report failures do not gate independent delivery |
| Matching `src/__tests__` files | Focused journal, delivery, bridge, Docker/runtime and accounting-only bootstrap regressions |
| Existing isolated real Convex qualification harness | Exercise actual signed action, historical settlement, concurrency and lost replies against exact source hashes |

No new Convex tables, mutation entry points, lease paths, formula versions, provider routing,
model billing interpretation, or frontend redesign is expected. If the real
signed-action proof exposes a historical authorization dependency that still
requires active execution, stop that specific implementation and report the
concrete dependency; do not weaken authentication to finish the test.
The pending source design additionally labels exact existing rejections in
`convex/factory/providerLiability.ts` and the settlement action in
`convex/serviceCommands.ts`; it changes no calculation, success return, record
write, or authorization order. These source patches remain separately blocked
as described above.

## Red-before-green acceptance tests

Capture failing regressions before production edits, then retain exact source
hashes with focused unit/integration and actual local backend evidence.

1. Reproduce the current lost-observation boundary: known result, failed
   settlement, Docker failure, process restart. Assert original payload can be
   delivered after restart and no provider send/reservation/claim occurs.
2. Fault injection at every storage boundary: exclusive ticket creation, file
   write, file fsync, final publication, directory fsync, ack publication, and
   status update. No durable acknowledgment before its fsync; no known-to-empty
   UNKNOWN substitution; no inference success after capture failure.
3. Real child-process crash/restart after capture, after mutation commit with
   reply lost, and after reply before ack. Original payload/revision retained;
   fresh envelopes; one canonical usage event and retained original allocation.
4. Two concurrent drainers and an immediate-settlement/drainer race. One
   accounting effect, create-once ack, failed/stale status cannot undo ack,
   incident acknowledgment never resumes output or spending.
5. Startup with execution flags off, missing/expired provider grant, unavailable
   Docker, worker disabled/replaced, and expired/revoked execution profile.
   Pending accounting still delivers through current service authentication.
6. Actual signed settlement after terminal/cancelled/completed/replaced Attempt
   and expired lease, preserving original hold/Attempt/lease/generation/request/
   profile/price. Negative controls for every substituted identity, cross-scope
   root, replayed envelope, stale revision, and conflicting provider receipt.
7. Backend commit followed by service-command completion failure. The first
   command's FAILED status does not discard the observation; a fresh command
   receives exact-duplicate acknowledgment. Current operator correction causes
   retained BLOCKED_REVIEW, never automatic revision increase.
8. Reject root/entry/file symlinks, traversal, unexpected file types, oversized
   JSON, corrupt hashes, extra payload fields, invalid counters, mismatched
   intent, malformed ack, conflicting temporary observations and changed root
   scope. Never follow a file or endpoint named by stored payload data.
9. Exhaust all local slots across concurrent captures: the next request performs
   zero reservation/send while pending delivery still runs. Disk/fsync failure
   after a known result retains the typed payload and reports the durability gap.
10. Bounded scan, rotating-cursor fairness, max 8 submissions, 30-second pass,
    10-second abortable request, non-overlapping passes, backoff, shutdown and
    restart. A hanging HTTP request cannot create accumulating detached requests.
11. Diagnostics survive the Docker and sanitized runtime-event path, including
    a failed lease-gated report. No prompt, response text, secret, signed
    envelope, host path or full settlement payload appears in container frames,
    generic logs, or operator diagnostics.
12. Preserve existing successful bridge behavior, strict incident handling,
    observation v2/v3 compatibility, v1/v2 frozen economics reads, and spending
    fences. No money, confidence, outcome, human acceptance, or release promotion
    follows solely from journal delivery.

Qualification must distinguish filesystem process-restart proof, canonical
backend transaction proof, Docker diagnostic integration, and synthetic
transport evidence. Provider response loss before capture, host/disk loss,
archival operations, fleet-wide delivery throughput, and live provider/billing
qualification remain outside this bounded slice.
