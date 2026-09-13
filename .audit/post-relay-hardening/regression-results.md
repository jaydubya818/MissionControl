# Regression results

| Gate | Result |
|---|---|
| Workflow Engine full suite | 224 passed, 0 failed, 0 skipped |
| Convex full suite | 1,472 passed, 0 failed, 0 skipped |
| UI full suite | 368 passed, 0 failed, 0 skipped |
| Focused orchestration hardening + native Fab | 79 passed, 0 failed, 0 skipped |
| Full orchestration package | 770 passed, 0 failed, 11 explicitly skipped |
| Focused Factory lifecycle/synthetic contracts | 19 passed, 0 failed, 0 skipped |
| Repository TypeScript | passed |
| Skill lint | 71 skills, 0 errors, 0 warnings |
| Factory documentation consistency | passed |
| `git diff --check` | passed |
| Browser qualification | passed; zero page errors |

## Explicit full-package skips

- `dockerBedrockBridge.test.ts`: exact Codex Bedrock V3 through no-network Docker and bounded tool cycle.
- `dockerFactoryWorker.test.ts`: seven Docker worker result/cancel/timeout/startup/budget/cleanup/crash cases.
- `dockerSandboxProvider.test.ts`: two Docker restart/lost-reply recovery cases.
- `governedContextBridge.integration.test.ts`: one end-to-end activation-receipt integration case.

These skips are pre-existing environment-gated suites. Changed lifecycle paths are fully green, and native macOS Fab containment ran outside the nested sandbox without skips.
