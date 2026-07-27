# Improving a skill

Ship skill changes with evidence, not intuition.

## Baseline vs candidate

Each eval run executes scenarios twice:

- **Baseline** — agent without the skill (or prior version)
- **Candidate** — agent with the skill under test

Scores roll up to `impactScore` and `impactDelta` on `contextEvalRuns`.

## Define good scenarios

- Real task prompts from production WorkOrders
- Weighted criteria aligned to skill purpose
- At least one negative case (skill should refuse or defer)

## Read results

**Registry → Eval Runs** shows per-scenario criterion breakdown. FAILED runs include `errorMessage` for timeout or lint failures.

## Close the loop

Accept meta-loop suggestions of kind `EVAL_SCENARIO` or `SKILL_UPDATE` to auto-create scenarios or draft package patches.

## Publish policy

With `eval.framework` enabled, publish is blocked until latest eval COMPLETED with acceptable impact delta.

See [Eval runs](../registry/eval-runs.md).
