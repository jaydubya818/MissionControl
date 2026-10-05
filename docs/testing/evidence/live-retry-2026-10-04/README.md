# Capped route qualification continuation

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
inference is enabled. The Mission allocation has not been dispatched.

## Canonical preparation

The normal Research Lab APIs created a disabled exact model-route entry and an
active code scope limited to `docs/operations/verification-retry-runbook.md`.
Their IDs are in `canonical-preparation.json`. No execution profile was promoted,
factory activated, approval recorded, or unrelated workspace changed.

Mission creation was rejected because delivery requires a configured owner and
team. Research Lab's active org-member query returned no members. The operator
has been asked whether to add Jay West with a Factory Operations team or specify
another owner/team. No identity or membership was invented to pass this gate.

After ownership is resolved, freeze and review the actual worker configuration
and its qualification scope before admission. Then resume the governed run,
independent verification, human publication decision, restart proof, and draft PR.
The synthetic fixture's configuration is not automatically interchangeable with
the documentation worker's configuration.

Provider credential fields were checked against the current
[OpenRouter key creation reference](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key).
