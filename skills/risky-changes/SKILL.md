---
name: risky-changes
description: "Validate assumptions behind changes to billing, API data, or defaults."
license: MIT
metadata:
  author: David Ondrej and Skillz contributors
  source: davidondrej/skills
  source-commit: 8aa01cf45110ae378bdf5c319cd41ac8fdbdf448
  adaptation: curated-rewrite
  owner: software-factory
  risk: medium
  capabilities: davidondrej,product-assumption-validation
---

# Verify risky product assumptions

Use when a change to pricing, quotas, API filtering, provider data, or defaults
depends on uncertain real-world behavior. Passing unit tests cannot establish
that a new filter retains useful results or that a new threshold serves the
intended users. Routine refactors with unchanged behavior do not need this
workflow.

## Identify what could make the change wrong

Describe the behavior before and after, the affected users, and the decision
already approved. List only assumptions that could change the implementation or
release decision. For each, record its evidence, uncertainty, and consequence
if false. Separate product choices from implementation details.

Check the actual provider contract and version using primary documentation.
Use representative, authorized data to test assumptions about frequencies,
formats, missing values, regions, currencies, boundaries, and failure cases as
relevant. Competitor behavior can inform a question; it does not prove the
correct answer for this product.

## Compare behavior

Define acceptance criteria before measuring. Select cases that cover the
assumption and important customer groups, not an arbitrary case count. Compare
old and new behavior on the same inputs where possible. Record the denominator,
sampling method, environment, revision, and limitations behind each number.
Check aggregate results and affected subgroups so averages do not hide failures.

Prefer sanitized fixtures, provider sandboxes, or an approved read-only analysis.
Live calls can cost money or change state. Use them only within the task's
existing authority and budget. Do not create charges, change quotas, expose
customer data, or run a production experiment merely to obtain evidence.

Save the cases and results in the project's existing evidence location. Include
commands or query references, expected and observed outcomes, and any unavailable
checks. Do not label synthetic or staging evidence as production validation.

## Make the release decision explicit

Report whether the evidence supports the approved behavior. If a material
assumption remains unresolved, continue independent preparation and state what
is needed before release. Present any changed customer behavior or pricing
choice to the product owner with the evidence. Existing approval counts when
it covers that behavior.

Record a rollout, monitoring, and rollback plan proportional to the risk. Name
the signal that would stop or reverse rollout and who will check it. Do not
deploy, schedule monitoring, or claim a later production check happened unless
the task authorizes it and there is evidence of completion.
