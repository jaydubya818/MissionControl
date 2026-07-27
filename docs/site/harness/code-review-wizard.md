# Code review wizard

Seven-step guided review for agent-authored PRs — evidence through meta-loop feedback.

## Steps

1. **Evidence** — PR metadata, files, CI runs (`gatherEvidence`)
2. **Skill match** — registry search by change intent
3. **Launch config** — model tier, agent selection
4. **Change review** — lens scores per file
5. **Mutation testing** — caught vs escaped mutations
6. **Merge gate** — composite PASS/FAIL with reasons
7. **Meta-loop** — accept/dismiss improvement suggestions

## Implementation

UI: `HarnessCodeReviewWizardSteps.tsx`  
Backend: `convex/factory/codeReviewWizard.ts`, `convex/lib/mergeGates.ts`

## Demo

Seed includes harness PR checks #200–205 with lens scores and mutation findings. Open wizard from **Harness → Workshop** or Change Review panel.

## Harness-first PR comment

When gate passes with warnings, post structured commentary (lens summary + mutation coverage) before merge — template in Change Review modal.
