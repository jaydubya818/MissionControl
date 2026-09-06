# Fab Phase 3 offline qualification

Fab remains **Experimental**. This record covers local implementation and injected conformance qualification. It does not establish live provider execution, deployed Convex persistence, controlled GitHub publication, whole-agent containment or Phase 3 completion.

## Source and runtime identity

The implementation is on `codex/fab-phase3`, reconciled with MC main `f90c50f5b4191467b2117bb8762754f697b1cefd`. Merge `1401a4e` preserves the current-main governed MCP and legacy local candidate recovery work. Runtime contract **v43** includes the Fab lifecycle changes; legacy v1 local attestation remains separate from Fab's v2 pre-publication subject and cannot authorize acceptance or publication.

MC consumes private `@fdlc/fab@0.1.0-experimental.2`, built from FDLC source `1d1240c219d9bf3c1fa5fbb0a80ded96cf13df1f`. Archive SHA-256: `b3a1af223e246208c01745678cbe48a91786070b016b9a1ad7bdb0ad274d8a8d`. Installed 41-file closure SHA-256: `121ef8e14b085f6dba6e7f5598070ad80e79f5c1bfa5c71b890871bf83214999`. Three independent packaging runs, including a fresh detached checkout, produced that archive. Later site/docs commits do not change this immutable package pin. Its native helpers require macOS 26.0+ arm64 and are ad-hoc linker signed; Developer-ID signing/notarization and a Fab licensing decision remain external release gates.

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

## External gates and delivery

No exact live provider/model or enrolled credential has been selected and authorized. All five real-model engineering evaluations remain **NOT RUN**. Deployed admission, persistent restart/requery, real-model lineage, human checkpoint, controlled publication and remote response-loss reconciliation require an authorized non-production MC environment and dedicated qualification GitHub target.

Implementation PRs, CI, merge and post-merge clean-main qualification are also **NOT RUN**. Automatic approval review blocked export to the FDLC and MissionControl GitHub repositories pending explicit destination/data authorization. Local commits and qualification continue. No artifact-upload workflow was added. Public signing and licensing are independent release decisions; green offline qualification does not remove those gates.
