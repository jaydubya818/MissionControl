---
name: deslop
description: "Remove AI-generated code slop and clean up code style Use this skill when the user asks for deslop or the task clearly matches this workflow."
license: MIT
metadata:
  author: lauren-tan-pstack
  source: michael-denyer/pstack-claude
  source-version: "0.9.29"
  source-commit: 458050195fdb347955a63812e6d749f164a8f62d
  owner: software-factory
  risk: medium
  capabilities: pstack,engineering-workflow
---

# Remove AI code slop

Check the diff against main and remove AI-generated slop introduced in the branch.

## Focus Areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- Keep the final summary concise (1-3 sentences).
