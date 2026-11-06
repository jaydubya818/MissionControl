---
name: prompt-for-others
description: "Write a verified setup or fix prompt for a teammate's agent on request."
license: MIT
metadata:
  author: David Ondrej and Skillz contributors
  source: davidondrej/skills
  source-commit: 8aa01cf45110ae378bdf5c319cd41ac8fdbdf448
  adaptation: curated-rewrite
  owner: software-factory
  risk: low
  capabilities: davidondrej,teammate-instructions
---

# Write a prompt for a teammate's agent

Use when the user asks for instructions another person's agent can apply
without this conversation. Deliver a copyable prompt; do not send it to the
teammate or execute it on their machine.

Ground the prompt in the fix, setup, or upgrade already verified in the current
task. Record the tested environment and commands. Do not perform an unrelated
installation or destructive test just to satisfy this workflow. If the fix is
untested, say so and write a diagnostic or preparation prompt instead of
claiming it is ready to apply.

Include the goal, enough context to explain the change, prerequisites, bounded
steps, verification commands with expected results, and a stop condition.
Identify the exact approved version or configuration when it matters. Use a
short paragraph for a simple fix or a short sequence when order matters.

Make the prompt safe to use on another machine:

- Resolve the intended repository and installed version before changing them.
  Do not copy the current user's absolute paths, account IDs, or service labels
  as universal values.
- State how to discover necessary values. If a value cannot be determined
  safely, stop for it. Do not leave an executable placeholder that looks real.
- Preserve unrelated local changes. Include backup or rollback steps where
  the operation needs them, and stop on unexpected state or failed checks.
- Name required tools and supported environments. Missing prerequisites are
  a stop condition unless installation is part of the requested work.
- Reference approved local credential locations without values. Exclude
  private URLs and customer data the recipient is not authorized to see.
- Require the recipient to confirm authority for their environment before
  consequential actions. The original user's local approval is not permission
  to change another person's machine, publish, deploy, or spend money.

Read the result as an agent with no history. It should be clear what to change,
how to prove success, when to stop, and which facts to report. Return the prompt
in one copyable block, with any material verification limit stated explicitly.
