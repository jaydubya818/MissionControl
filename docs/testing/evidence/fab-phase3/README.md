# Fab Phase 3 qualification

Fab remains **Experimental** and is usable in the approved non-production local mode. Readiness now requires at least one current qualified provider route. OpenRouter is `ACTIVE_QUALIFIED`; Bedrock remains supported but is `EXTERNAL_WAIT` with reason `AWS_QUOTA` and is not a readiness dependency.

The current live qualification uses the exact OpenRouter route `openai/gpt-4.1-mini` through `https://openrouter.ai/api/v1/chat/completions`, non-streaming, with zero retries and no fallback. One bounded synthetic WorkOrder completed, produced a candidate, and passed a separate verifier Attempt. The successful evaluation made eight tool-loop model requests, reported 5,818 input tokens, 346 output tokens, 26,776 ms producer latency, and actual cost of $0.0028808. See the [live evidence record](../fab-openrouter-live-2026-09-07/README.md).

## Latest reconciliation

[Current-main qualification](../fab-phase3-inference-reconciliation/README.md)
passes at `4efffbb035859b824ddb64cc8943b1e8f49f5f4c`, merging main `cc1c530`.
This includes governed inference accounting and its closure. Contract **v44**
fences the combined schema; 19 System gates, 15 browser tests, installed Fab/Node
identity and the incoming accounting check pass in a fresh checkout. Independent
security review reports GO for this bounded offline merge delta. The sections
below retain earlier source-specific qualification history.

## Earlier source and runtime identity

The implementation is on `codex/fab-phase3`, reconciled with MC main `f90c50f5b4191467b2117bb8762754f697b1cefd`. Merge `1401a4e` preserves the current-main governed MCP and legacy local candidate recovery work. Runtime contract **v43** includes the Fab lifecycle changes; legacy v1 local attestation remains separate from Fab's v2 pre-publication subject and cannot authorize acceptance or publication.

MC consumes vendored `@fdlc/fab@0.1.0-experimental.2`, built from FDLC source `1d1240c219d9bf3c1fa5fbb0a80ded96cf13df1f`. Archive SHA-256: `b3a1af223e246208c01745678cbe48a91786070b016b9a1ad7bdb0ad274d8a8d`. Installed 41-file closure SHA-256: `121ef8e14b085f6dba6e7f5598070ad80e79f5c1bfa5c71b890871bf83214999`. Three independent packaging runs, including a fresh detached checkout, produced that archive. Later site/docs commits do not change this immutable package pin. Its native helpers require macOS 26.0+ arm64 and are ad-hoc linker signed; Developer-ID signing/notarization and a Fab licensing decision remain external release gates.

Later [upstream reconciliation](../fab-phase3-upstream/README.md) preserves main `6d7146d5205aef729aee2960aed2a4ed8e8ab95c` through local merge `4b95edd9`. Only two incoming documentation files changed. The executable tree is identical to the final clean-qualified implementation below; affected documentation and runtime-contract checks pass against the newer baseline.

## Completed local gates

- Exact runtime/model-route admission, frozen candidate identity, independent verifier admission, human receipt lineage, permit-bound publication and read-only uncertain-outcome reconciliation are covered by local tests with injected model/control-plane/GitHub transport.
- Combined Fab/MC conformance passes 254 tests in 28 files. A separate final canonical mutation suite passes 22 tests, including exact read-only local recovery reclaim and all existing recovery status cases. These overlapping suites are not summed.
- Final clean-checkout System Qualification passes all 19 gates at `f5ed5d10ac58ba4472eddd882a06406fd96d9830`, after the canonical recovery guard and terminal-history fixes. Standard frozen pnpm install, full repository tests, security/docs checks, typecheck/lint, runtime contract v43, production build, startup smoke and historical immutability all pass. The fresh browser run also passes all 15 tests, and actual installed Fab/Node bytes match the expected identity. Older successful and failed runs remain separate.
- Mission Control browser qualification passes 15 critical flows. The recovery component has four desktop/mobile and dark/light accessibility checks with zero axe violations or overflow. These use local browser fixtures, not a deployed backend. A missing browser-cache run failed before navigation and was rerun with the explicit installed browser path.
- Independent security review and main-thread data-integrity, architecture and simplicity review are GO for their inspected offline scope. See [review record](reviews/offline-reviews.md).
- A pinned Docker canary proves only its measured container restrictions and teardown. Fab remains `LOCAL_DEVELOPER_MODE`; whole-agent containment and remote Fab credential grants remain **NOT QUALIFIED**.
- Actual offline frozen pnpm dependency preparation succeeds with a prewarmed store and lifecycle hooks disabled; an empty store fails closed at the bounded timeout. This does not qualify arbitrary dependency-heavy Fab checks.

## Evidence history

| Record | Result and source |
| --- | --- |
| [Initial full qualification](automated-checks.json) | PASS, `ac8e38c` |
| [Attempt 1](../fab-phase3-run-01/automated-checks.json) | FAIL, `e8d9b45`; stale runtime documentation |
| [Attempt 2](../fab-phase3-run-02/automated-checks.json) | FAIL, `8a42c18`; hardcoded runtime documentation assertion |
| [Attempt 3](../fab-phase3-run-03/automated-checks.json) | FAIL, `e3b25f2`; UI identifier typo found by full TypeScript check |
| [Current-main reconciliation](../fab-phase3-reconciled/automated-checks.json) | PASS, `1401a4e` |
| [Ownership transfer repair](../fab-phase3-final/automated-checks.json) | PASS, `f698b7c`; before final canonical reclaim guard |
| [Final clean-checkout qualification](../fab-phase3-clean-final/clean-validation.json) | PASS, `f5ed5d1`; standard install, all 19 System gates, 15 browser tests, installed runtime identity |
| [Final focused tests](canonical-recovery-tests.txt) | PASS, 22 actual mutation tests |
| [Combined conformance](combined-tests.txt) | PASS, 254 tests |
| [Browser suite](browser-final.txt) | PASS, 15 tests |

Qualification runs append unique governed-MCP records. Historical Phase 2 and system-v1/v2 evidence is preserved. Copied terminal logs remove ANSI control sequences and trailing whitespace; original local logs retain raw output. Evidence contains synthetic fixtures and local build/test metadata, with no live provider calls or customer payloads. A high-confidence secret scan is a bounded check, not universal secret detection.

## Remaining scope

OpenRouter qualification establishes the local producer/verifier route and its attempt-scoped credential lifecycle. It does not qualify Fab for production workloads, broader workload families, whole-agent containment, Linux or Windows, Developer-ID signing/notarization, or licensing. Bedrock live qualification remains independently blocked by AWS quota and does not reduce OpenRouter readiness.
