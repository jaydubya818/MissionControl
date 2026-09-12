# Applied recovery source checkpoint

Status: `APPLIED_FOCUSED_TESTS_AND_TYPECHECK_PASS`

The Product Owner approved the three reviewed recovery edits on 2026-09-06. The
approval source SHA-256 is
`a71e3e76833b56da71d1b22e1df3bb0d326e088d4b976b2d3da2dc9d9928c1ab`.

Focused verification on the frozen applied source passed:

- 186 orchestration tests; two existing conditional daemon skips.
- 196 backend and authority tests; no skips.
- Orchestration TypeScript check.
- Runtime contract guard across 970 public functions; runtime contract remains
  v50.
- Documentation consistency and runtime guard regressions: 14 tests.
- `git diff --check`.

An actual module import and status regression reproduced three fail-open cases
before the startup correction, then passed five cases after it. Missing or blank
provider configuration, missing call authorization, registry failure, and host
binding failure all disable the complete Factory execution bootstrap. A configured
accounting recovery runtime remains independent.

The principal final source SHA-256 values are:

| Source | SHA-256 |
| --- | --- |
| `apps/orchestration-server/src/index.ts` | `fb4d12c41fc5be407d517b61854b76dd9bdbdabacd0a2c9636dc3e6c48a90ea2` |
| `apps/orchestration-server/src/accountingDeliveryWorker.ts` | `72ef39424ff163614235a5242ecd1088bdb41e65a3ccdb22e7a38fae94d74a1a` |
| `apps/orchestration-server/src/bedrockInferenceBridge.ts` | `9d4269ea46017a74fe54ea27b40cc6c632f9b339eef3ceb57436c1296b4f2f74` |
| `convex/factory/providerLiability.ts` | `22b622d6aca64ef906e49add28d21fb045ee5818af2e8843a9ccd6812084aa25` |
| `convex/serviceCommands.ts` | `82c5af6be63bed4255898b7327a627be5a40a5d695e173ae85f2e16c9e8f57a0` |

The checkpoint made no provider call, did not start a listening service, and did
not alter Production. Actual signed backend recovery and final integration proof
are separate required gates.
