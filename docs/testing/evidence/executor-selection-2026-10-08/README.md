# Replacement executor selection, October 8, 2026

Status: OFFLINE CANDIDATE QUALIFIED FOR FURTHER TESTING. Full qualification is
incomplete. No paid model inference, new canonical Attempt, live credential,
shared deployment, or production image identity change occurred.

## Evidence

- Native pinned Codex 0.146.0 passed health, prepare, Git baseline and unchanged
  result capture against the actual producer checkout at
  `5308727463ec737589bf8072ee9f5de0af1bba7a`. See
  `codex-repository-preflight.json` and its retained script. Provider executions
  were zero. The ambient 0.157.0 binary was rejected, as retained separately.
- `docker-final-results.txt` records 16 passing tests: eight actual local Docker
  cases plus eight liability-bound tests. Docker covers result, cancellation,
  timeout, startup failure, budget denial, cleanup failure, worker process death,
  and a two-request Bedrock tool cycle using synthetic responses.
- `executor-regression.txt` records 71 passing Codex executor, Bedrock bridge,
  and Docker admission tests. `accounting-regression.txt` records 66 additional shared-fixture accounting
  and qualified transport checks. Total focused passing checks: 153.
- Fixture corrections are committed as `25f2992`.
- Initial and intermediate failures are retained. The fixture initially signed
  stale Attempt/lease identities. After that correction the bridge rejected the
  second request because 2,000,000 synthetic nano-USD did not cover two retained
  1,004,096 liabilities. The final fixture reserves exactly 2,008,192, allows two
  requests, and asserts both holds remain. No real price or budget was changed.
- The recovery subprocess now accepts the parent's explicit qualification
  config. Without it, the child selected the absent old image.

## Candidate and reproduction

`docker-candidates.json` identifies both new local image digests. Production
identity constants are unchanged. The temporary Vitest setup substitutes only
these candidate identities; the actual provider, containment inspection,
bridge admission and transport code remain in use. This is offline qualification
under synthetic authority, not proof of production admission.

Restore `qualification.config.ts.txt` as
`apps/orchestration-server/.executor-selection.config.ts`, and restore
`qualification.setup.ts.txt` as
`apps/orchestration-server/src/__tests__/.executor-selection.setup.ts`. With the
local candidate images available, run from the repository root:

```sh
MC_DOCKER_QUALIFICATION=1 MC_DOCKER_QUALIFICATION_CONFIG=.executor-selection.config.ts pnpm --filter @mission-control/orchestration-server exec vitest run --config .executor-selection.config.ts src/__tests__/dockerFactoryWorker.test.ts src/__tests__/dockerBedrockBridge.test.ts src/__tests__/bedrockLiabilityBound.test.ts
pnpm --filter @mission-control/orchestration-server exec vitest run src/__tests__/bedrockInferenceBridge.test.ts src/__tests__/dockerBedrockAdmission.test.ts src/__tests__/codexExecutorAdapter.test.ts
```

The base image uses `infra/docker-factory/Dockerfile`; the combined Bedrock
candidate Dockerfile is retained here. Both were built for linux/amd64 from
pinned parent `ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`
with build networking disabled. Registry access downloaded only that parent.

## Limits and next gate

Prefer the governed Codex Bedrock Docker path for further qualification. Native
Codex preflight does not establish strict mutating containment or an enforceable
provider spending cap. The Docker tool cycle used a small disposable repository,
not the full Mission Control checkout. Full repository packaging, execution,
independent verification, and canonical Mission completion remain unproven.

The saved exact-route Bedrock price approval has expired. Before a paid Attempt,
qualify the full repository in Docker, obtain current price evidence, bind an
approved reservation and configuration to the current WorkOrder revision, then
seek a fresh activation decision. Keep the original failed Attempt and its
revoked credential unchanged. Its $4.49 reservation stays retained; observed
cost $0.0102412 does not establish complete billing settlement. No broader
deployment is authorized by these local results.
