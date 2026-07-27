# Setting up agentic code review

Scale PR review for agent-authored changes with Harness engineering surfaces.

## Components

1. **Change review lenses** — security, correctness, style (configurable per repo)
2. **Mutation testing** — diff coverage % and caught/uncaught mutations on changed files
3. **Merge gates** — CI status + lens scores + human-touch thresholds
4. **Code review wizard** — seven-step E2E: evidence → skill match → launch → meta-loop

## Seed data

Demo seed inserts six `harnessPrChecks` rows against `jaydubya818/MissionControl` PRs #200–205.

## Wizard flow

Open **Harness → Workshop** or the wizard route from **Change Review**:

1. Gather PR evidence (Convex `factory/codeReviewWizard.gatherEvidence`)
2. Match registry skill by intent
3. Configure launch (model tier, schedule)
4. Run change review lenses
5. Mutation testing summary
6. Merge gate verdict
7. Meta-loop feedback (accept/dismiss suggestions)

## Merge gate comment

Architect Mode shows live gate status. Post harness-first PR commentary before merge when CI is green but human-touch budget exceeded.

## Related

- [Architect Mode](../harness/architect-mode.md)
- [Code review wizard](../harness/code-review-wizard.md)
