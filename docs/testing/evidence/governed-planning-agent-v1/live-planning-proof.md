# Live governed planning proof

Date: 2026-08-27
Mission: `z97914e3pxmw9pscxm12jcw2rd8d9jyr`
Repository: `jaydubya818/MissionControl`

## Successful Planning Run

- Run: `yn71gwer0h1jrdy257n0c9cdq18d9dz6`
- Status: `SUCCEEDED`
- Attempt: 1
- Planning SHA: `470057334800c7cddfc268b3f26d5ef3fc632088`
- Planner: built-in `Mission Planner`, `mission-planner/v1`
- Model route: `openai/gpt-5.6-sol`
- Routing decision: `zh7cyrqnb9rrvsmxzknnn4qfsd8d9z1w`
- Factory version: `sh7fwgwkpkbwqawvarekb7r5eh8d8vh7`
- Factory digest: `factory-v1-d2b4fdf9`
- Research packet digest: `sha256:77857e509ab16db0bc4b57fe13470c5840f90a55fb4500f37885c197a9b1f90c`
- Candidate digest: `sha256:08119091e4979201aced72e9b5c83d6260999937a9a500f98f99a4012da8f736`
- Output digest: `sha256:162350637b065a00c2449a07ba5a0d47bb7f9f14fd4eaec53bde6e2abe60be01`

The candidate's authority projection persisted `false` for submission, approval, execution, verification, and acceptance.

## Exact-SHA research execution

- Execution receipt: `yn71gwer0h1jrdy257n0c9cdq18d9dz6:1:research`
- Prompt: `mission-planner-research/v1`
- Prompt digest: `sha256:8e8cd02631d69d2bc40fa735b0838bb2bb2b8e221e9a439b2128d67c63d8c8b6`
- Harness: `codex-cli` 0.146.0, adapter `codex/v1`
- Sandbox: `READ_ONLY`
- Duration: 103,719 ms
- Tool calls: 11
- Baseline/head: `470057334800c7cddfc268b3f26d5ef3fc632088`
- Changed files: 0
- Scope violations: 0

Files inspected:

1. `convex/schema.ts`
2. `convex/missions.ts`
3. `convex/lib/workOrderCreate.ts`
4. `apps/mission-control-ui/src/eos/views/MissionPlanWorkspace.tsx`
5. `docs/software-factory/governed-missions-contract.md`
6. `tests/e2e/local-mission-golden-path.e2e.spec.ts`
7. `package.json`
8. `playwright.config.ts`
9. `.git`

The accepted packet contains 26 unique, server-verified line citations linked to 11 findings and 7 explicit unknowns. Citation validation confirmed repository containment, regular files, real line endpoints, unique IDs, finding linkage, bounded excerpts, and packet size. The model explicitly reported that `.git` redirects outside its approved readable boundary; it did not falsely claim it had independently read the external Git metadata. The control plane and post-run repository receipt supplied and verified the immutable SHA.

## Generation execution

- Execution receipt: `yn71gwer0h1jrdy257n0c9cdq18d9dz6:1:generation`
- Prompt: `mission-planner-generation/v1`
- Prompt digest: `sha256:06b3ee18fc5b7112bf7fc214a641d2bcc8385f57741ca33284effee5975f0029`
- Harness/model: same admitted `codex-cli` / `openai/gpt-5.6-sol` tuple
- Duration: 74,175 ms
- Baseline/head: `470057334800c7cddfc268b3f26d5ef3fc632088`
- Changed files: 0
- Scope violations: 0
- Structured schema: `mission-plan-candidate/v1`

Generation started only after the research execution and packet validation completed. The server reloaded both durable receipts, validated the structured candidate, canonicalized the stored candidate before digest comparison, and persisted the candidate only after all checks passed.

## Browser and durability evidence

- [Candidate ready and unadopted](./live-browser/planning-candidate-ready-unadopted.png)
- [Candidate adopted into DRAFT](./live-browser/planning-candidate-adopted-draft.png)
- [Plan submitted](./live-browser/planning-plan-submitted.png)
- [Plan approved and WorkOrders released](./live-browser/planning-plan-approved-released.png)
- [Active run before refresh](./live-browser/planning-retry-active-before-refresh.png)
- [Same run after refresh](./live-browser/planning-retry-active-after-refresh.png)

Four Planning Runs remain durable: three failed non-authoritatively during genuine validation defects, followed by the successful run. The architecture intentionally creates a new run and reruns exact-SHA research after a non-retryable failure; it does not overwrite or mutate the prior run's completed receipts. No duplicate authoritative candidate was created.

## Human-controlled Plan result

- Plan: `ys7at6f5rkhgwd4z36e9mr2jfh8d866g`
- Revision: 1
- Status: `APPROVED`
- Planning Run: `yn71gwer0h1jrdy257n0c9cdq18d9dz6`
- Planning SHA: `470057334800c7cddfc268b3f26d5ef3fc632088`
- Candidate digest: `sha256:08119091e4979201aced72e9b5c83d6260999937a9a500f98f99a4012da8f736`
- Quality contract digest: `sha256:eb3a560344c23213dc6d122445f8e0f882c581323a5973432c7d9be8823342c3`
- Approved by: `development:local-operator`

The operator applied the candidate to the editor, saved an editable DRAFT, submitted it, and approved it with a real rationale. Generation itself performed none of those transitions.
