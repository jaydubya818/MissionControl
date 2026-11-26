---
name: deslop
description: "Use when code needs generated clutter removed and structure simplified without behavior changes."
license: MIT
metadata:
  author: jstack-maintainers
  source: michael-denyer/pstack-claude
  source-version: "0.9.130"
  source-commit: d88063f3355a5ecff0e6dbb890a11bab4b08bc2e
  owner: software-factory
  risk: medium
  capabilities: jstack,engineering-workflow
---

# Remove AI code slop

Check the diff against the branch's base and remove AI-generated slop introduced in the branch. The base is the PR's base branch, else the branch this one was cut from, else the repository's default branch. Include uncommitted changes.

## Focus Areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- After editing, rerun the checks that verified the change (tests, type check, and the driver skill for UI work) and report their results.
- Revert any edit whose check fails.
- Keep the final summary concise (1-3 sentences).
