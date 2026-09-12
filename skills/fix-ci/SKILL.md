---
name: fix-ci
description: "Find failing PR checks, inspect logs or external check links, and apply focused fixes Use this skill when the user asks for fix ci or the task clearly matches this workflow."
license: MIT
metadata:
  author: lauren-tan-pstack
  source: michael-denyer/pstack-claude
  source-version: "0.9.29"
  source-commit: 458050195fdb347955a63812e6d749f164a8f62d
  owner: software-factory
  risk: medium
  capabilities: pstack,pull-request-workflow
---

# Fix CI

## Trigger

Branch or PR CI is failing and needs a fast, iterative path to green checks.

## Workflow

1. Resolve the active PR and inspect `gh pr checks --json name,bucket,state,workflow,link`.
2. Inspect failed jobs and extract the first actionable error. Use GitHub Actions logs when available; otherwise use the check link to identify the failing command or service.
3. Apply the smallest safe fix.
4. Push, re-check the PR check set, and repeat until green.

## Guardrails

- Fix one actionable failure at a time.
- Prefer minimal, low-risk changes before broader refactors.
- Keep `gh pr checks` as the source of truth for overall PR CI state.

## Output

- Primary failing job and root error
- Fixes applied in iteration order
- Current CI status and next action
