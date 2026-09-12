---
name: what-did-i-get-done
description: "Summarize authored commits over a user-specified time period into a concise update Use this skill when the user asks for what did i get done or the task clearly matches this workflow."
license: MIT
metadata:
  author: lauren-tan-pstack
  source: michael-denyer/pstack-claude
  source-version: "0.9.29"
  source-commit: 458050195fdb347955a63812e6d749f164a8f62d
  owner: software-factory
  risk: low
  capabilities: pstack,engineering-research
---

# What did I get done

## Trigger

Need a short, high-signal summary of work completed in a specific time range (for example: yesterday, last 3 days, or last week).

## Workflow

1. Resolve the requested time window into concrete dates.
2. Read commits authored by the current git user email within that range.
3. Exclude merge commits and uncommitted changes.
4. Synthesize the most important shipped changes into a concise status update.
5. Include the actual date range used in the final summary.

## Guardrails

- Be extremely concise and information-dense.
- Prioritize substantial behavior or architecture changes.
- Omit cosmetic-only changes (formatting, imports, minor renames).
- Do not infer intent or motivation. Describe changes functionally.

## Output

- One short summary suitable for a status update
- Real date range
- Optional 2-5 bullets for major changes only
