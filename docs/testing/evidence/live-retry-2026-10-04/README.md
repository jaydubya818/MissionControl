# Capped route qualification continuation

Latest checkpoint: the plan is approved, its WorkOrder is released, and both
factories passed readiness. Dispatch exposed a corrective-iteration boundary
bug before creating an Attempt. The tested fix awaits operator approval after
automatic approval review rejected its deployment. See
[the review packet](../../../operations/live-retry-dispatch-review.md).
The component qualification and earlier preparation record below remain evidence
of those earlier stages.

Component qualification passed on October 4, 2026, America/Los_Angeles
(October 5 UTC). The governed documentation WorkOrder has not started.

## Evidence

- `offline-tests.txt`: 25 focused adapter, runtime identity, and credential tests
  passed. The first shell-sandbox run failed three adapter tests; the same tests
  passed with temporary Git repositories and child processes permitted.
- `credential-revocation.json`: a real $0.01-capped credential authenticated before
  deletion, then returned 401 within the broker's 60-second confirmation bound.
  This probe invoked no model.
- `live-result.json`: the real OpenRouter `openai/gpt-4.1-mini` component run
  completed with a $0.50-capped credential. A separate checkout verified candidate
  `a712e8414b9d4d9e79e8fb3901994c0d75d79a61`. Credential rejection was confirmed
  after deletion. Provider-reported model cost was $0.0037908.
- `component-harness.mts.txt`: the exact one-off harness used. It derives from the
  existing Fab live qualification script, uses the configured Git author, retains
  the fixture, prevents a second dispatch through an exclusive reservation file,
  and labels its IDs and results as component evidence only.
- `source-digests.json`: hashes of the adapter, broker, credential implementation,
  runtime pin, and private runtime archive tested.
- `retained-fixture.json`: local fixture and state paths retained for inspection.

The fixture's Attempt and lease IDs are local test identifiers. They are not
canonical Mission Control records. Separate-checkout verification demonstrates
component behavior, not a persisted independent verifier Attempt. These results
do not grant production admission or prove worker restart and publication.

## Budget

The authorized total remains $5. `budget.json` allocates $0.01 to the credential
probe, $0.50 to component qualification, and $4.49 to the documentation Mission.
The first two allocations remain conservatively reserved even though both keys
were revoked and reported model cost is much lower. No further component
inference is enabled. The Mission allocation was used by one failed Attempt. Its full reservation remains retained.

## Canonical local qualification

Fix commit `33e3612` was applied only to Research Lab at port 3214 after explicit
operator approval. Post-commit results are in `postcommit-convex-tests.txt`
and `postcommit-orchestration-tests.txt`. They record 1,491 Convex tests and
766 orchestration tests passing, with 11 existing orchestration skips.

The approved Mission is now backed by one failed producer Attempt. WorkOrder
revision 2 records the local qualification boundary and NO_PRODUCTION_ACCESS
through normal APIs. `routing-blocker.json` preserves the initial production
certification rejection; `qualification-routing-preview.json` records the
supported qualification route. The original Task was canceled before execution
when its revision became stale. Its replacement is in the canonical checkpoint.

The final evidence files are:

- `dispatch.json` and `producer-attempt.json`, one initial Attempt with zero
  retries, claimed and failed at TURN_LIMIT.
- `duplicate-dispatch-proof.json`, repeated dispatch returns the same Attempt.
- `producer-runtime-summary.json`, eight model calls, no changed files or
  candidate, and provider-reported model cost of $0.0102412.
- `producer-inspector.json`, retained canonical events, review blockers, and
  current failure state. The runtime state path and hash are in the summary.
- `producer-credential-revocation.json`, scoped credential deletion followed by
  HTTP 401 within 15 seconds.
- `before-restart.json` and `restart-no-replay-proof.json`, failed Attempt and
  runtime state remain unchanged after worker restart and polling.

The Mission runbook golden path did not complete. Independent verification,
successful-candidate recovery, human publication approval, and draft PR were not
reached. The pilot worker is stopped. No broader deployment, GitHub push, or
merge occurred.

The failed Attempt's canonical spend is zero with actual cost unavailable.
Its runtime reports $0.0102412. Combined reported model cost is $0.014032;
the full conservative $5 allocation remains reserved. Do not interpret the
canonical zero as free execution or available retry budget.

See [operations status](../../../operations/live-retry-dispatch-review.md) for
corrected retry semantics, the qualification matrix, open issues, and the earlier
coordinator startup side effect. Historical pre-fix regression outputs in this
directory are retained as historical evidence, not current passing results.

Provider credential fields were checked against the current
[OpenRouter key creation reference](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key).

The `worker-entry.mts.txt`, `prepare-worker.mts.txt`, and
`prepare-verifier.mts.txt` files preserve the one-off preparation sources. They
are evidence, not general-purpose launch commands. The temporary worker launcher
is no longer runnable without restoring its reviewed entry file. Do not restart
this pilot or create another Attempt without the required execution authority.
