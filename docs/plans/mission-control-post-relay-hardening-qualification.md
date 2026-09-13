# Mission Control post-Relay hardening qualification plan

Status: complete

## Figure-it-out playbook

- [x] Read the Principles section of the `poteto-mode` skill.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Phase D: Keep the audit trail.
- [x] Phase E: Verify and hand back.

## Definition of done

A disposable three-WorkOrder Factory Run persists exactly three traceable members, gates each dependent on exact-revision acceptance, survives the required injected failures and restarts without duplicate work, exposes one truthful WorkOrder progress model in the UI, passes the required changed-area suites, ends in a clean committed worktree, and receives the annotated `mission-control-post-relay-hardening` tag. Relay repositories and historical evidence remain byte-for-byte untouched.

## Execution units

- [x] Review every staged, unstaged, and untracked baseline change and map it to an incident, lifecycle invariant, and test.
- [x] Commit the validated post-Relay baseline in coherent units.
- [x] Add immutable and auditable Factory Run membership with contamination regression coverage.
- [x] Add typed acceptance-bound WorkOrder dependency evaluation with exact-revision coverage.
- [x] Add a pure aggregate terminal outcome classifier with causal reason codes.
- [x] Add deterministic crash-point reconciliation without historical mutation.
- [x] Add the canonical WorkOrder progress read model.
- [x] Update WorkOrder UI for unified progress, dependencies, and evidence history.
- [x] Add immutable historical verification comparison.
- [x] Strengthen pnpm offline-store admission and distinguish store blockage from product install failure.
- [x] Complete pause, drain, stop, and cancel regression coverage.
- [x] Build the disposable three-WorkOrder synthetic qualification harness.
- [x] Prove happy path, timeout, environment, product failure, crash, retry, drain, dependency, and restart scenarios.
- [x] Run live browser qualification across synthetic lifecycle states.
- [x] Run the full regression matrix and bounded aggregate orchestration suite.
- [x] Commit final hardening, verify a clean tree, and create the annotated baseline tag only if every required gate passes.
- [x] Produce the final ten-part qualification report and stop without starting product work.

## Designed sequence

1. Preserve and commit the already-green baseline before adding new behavior.
2. Establish domain foundations in this order: membership, dependency semantics, terminal classifier, reconciliation.
3. Build the unified read model from those foundations, then make the UI a projection of that model.
4. Strengthen dependency admission and operational controls.
5. Build one deterministic synthetic qualification lever that exercises the real domain services without Relay.
6. Qualify unit behavior, restart behavior, browser truth, and aggregate suites.
7. Tag only a fully committed, clean, qualified candidate.

## Constraints

- No changes or dispatches in `/Users/jaywest/relay`.
- No changes in `/Users/jaywest/factory-pilot` or its worktrees.
- No mutation of historical Relay Attempts, candidates, evidence, or verdicts.
- No unsafe Fab containment fallback.
- No claim of qualification when a required gate is skipped, failed, or inconclusive.
- No implementation delegation. The `no-comments` skill required one fresh read-only reviewer; its two findings were applied before qualification.
