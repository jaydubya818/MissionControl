# Production Routing Evidence Bootstrap V1

## Decision

`BLOCKED`

The production bootstrap stopped before any configuration mutation or workload dispatch. Current production cannot admit either requested execution tuple through the existing governed primitives, and manufacturing records around those gates would invalidate the evidence.

## Exact baseline

- Source and final audited SHA: `95b6b2d18fb9f14b610d908338fb4e9d8054e171`
- Production workspace: `Mission Control Software Factory`
- Repository binding: `jaydubya818/MissionControl` at `main`
- Audit time: `2026-08-21T16:34:42Z`
- Production mutations performed: `0`
- WorkOrders dispatched: `0`
- Guarded Auto enabled: `false`
- Routing decisions created: `0`

## Requested tuple identities

The exact runtime identities are known and still match their prior qualification:

| Tuple | Model | Backend | Harness manifest | Effective configuration | Production Factory Version |
| --- | --- | --- | --- | --- | --- |
| Local Codex | `openai/gpt-5.6-terra` | `persistent-worker` | `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06` | `94daa9e3e1ee5ce2e3d8ca9116ec29c1a1eb8d78e232d1abb383cbdf2e7d6081` | none |
| Hardened Remote Codex | `openai/gpt-5.1-codex-mini` | `remote-sandbox` / exe.dev | same `codex/v1` identity | same `codex/v1` identity | none |

Codex CLI is `0.146.0`. The local Darwin arm64 executable digest is `ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02`, exactly matching the frozen `codex/v1` manifest. The remote image remains:

`ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`

Its exact profile digest is `sha256:3a5646bbc2cc880492e28dac8d67875070c15bdce6781a9aeeba5f595e244e8d`.

## Blocking conditions

1. Production has no GitHub App installation, and the production Convex environment has no GitHub App configuration. `factory/configuration:assessReadiness` therefore cannot pass its mandatory GitHub check.
2. The qualified remote profile must remain `security.qualificationOnly: true` under `validateSandboxProfile`, while `sandboxProfileProductionEligible` rejects that exact state. The same runtime validator correctly records provider egress as unavailable and guest nftables as qualification-only defense in depth.
3. `factory/configuration:createSandboxProfile` cannot ingest the qualified profile. It always records `liveCertified: false`, always adds the missing-live-certification blocker, and describes restricted egress as requiring provider enforcement evidence that exe.dev does not provide.
4. Production model catalog is empty. Existing public mutations create only generic `runtime/operator-*` routes or prefixed local Ollama/LM Studio/MLX/vLLM routes; neither requested exact OpenAI model can be registered through the existing catalog primitives.
5. All four current production workflows fail the required structured-status contract. No safe current workflow can back a Factory Version.
6. Production also has zero code scopes, verifiers, policy envelopes, worker bindings, Sandbox Profiles, Factory Definitions, Factory Versions, and readiness assessments.

These are configuration and contract blockers, not a lack of willingness to collect samples. Fixing them requires an explicit, reviewed product decision and deployed durable changes. The evidence-bootstrap authority cannot deploy, weaken readiness, convert qualification-only evidence into production authority, or use an unauthenticated workflow write to bypass governance.

## Evidence result

- Local exact-current verified Attempts: `0`
- Remote exact-current verified Attempts: `0`
- Workload distribution: none; execution was not admitted
- First-pass rates: `null`
- Reliability coverage: `0%`
- Latency coverage: `0%`
- Cost coverage: `0%`
- Diagnostic coverage: `0%`
- Overall governed coverage: `0%`
- Server-owned provider health: missing for both tuples
- Final exe.dev VM inventory: `0`

The unchanged Guarded Auto thresholds remain 5 verified Attempts, 60% evidence coverage, a 5-point margin, and a 30-day window. They are not satisfied. No policy or decision history was created.

## Validation

The final `pnpm run qualify:factory` run passed all 17 gates: release security and secret scans, immutable historical evidence checks, composed system qualification, Factory contracts, Generic Harness, Verification Factory, Factory Memory, Review Intelligence/Factory Learning UI contracts, full repository tests, TypeScript, skill lint, runtime guard, production build, orchestration smoke, and `git diff --check`.

An initial qualification invocation had two worker-test timeouts in its parallel composed group. The exact three-suite serial diagnostic passed 13/13, and the unchanged full qualification rerun passed all 17 gates. Both facts are preserved in `validation-summary.json`; this was repository validation, not a retried production Attempt.

## Historical evidence treatment

The remote image's historical canary and 3/3 cohort remain valid qualification context, including 0 Critical / 0 High, guest nftables, UID/GID 10001, empty capabilities, bounded credential revocation, and exact teardown. They remain explicitly qualification-only and were not imported into production Attempt lineage.

The earlier local Factory pilots likewise remain historical. They were not converted into current Factory-Version-bound Attempts.
