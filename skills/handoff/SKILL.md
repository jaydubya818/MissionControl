---
name: handoff
description: "Write verified session context when asked to hand work to another agent."
license: MIT
metadata:
  author: David Ondrej and Skillz contributors
  source: davidondrej/skills
  source-commit: 8aa01cf45110ae378bdf5c319cd41ac8fdbdf448
  adaptation: curated-rewrite
  owner: software-factory
  risk: low
  capabilities: davidondrej,session-handoff
---

# Session handoff

Use when the user requests a handoff or continuation brief. Capture enough
verified context for another agent to resume the same task. Writing the brief
does not create, message, archive, or transfer a chat.

## Capture the current state

Read the task's existing handoff and relevant project instructions. Check the
actual checkout, branch, commit, dirty files, and referenced PR status.
Separate completed work from attempted, partial, blocked, and unstarted work.
Record checks with their commands, results, and tested revision. If verification
is unavailable, identify the claim and its source instead of presenting it as
current fact.

Preserve the user's objective, constraints, approved decisions, pending choices,
and corrections. Record rejected approaches only when their reasons would save
the next agent from repeating a failure. Link existing plans, ADRs, diffs, and
evidence instead of copying them. Include task-owned running jobs or worktrees
only when they affect continuation.

## Write the brief

Use the project's existing handoff location when established. Otherwise save a
uniquely named Markdown file in the OS temporary directory and report its
absolute path. Do not overwrite another task's handoff. A temporary file may not
survive cleanup or exist on another machine; state that limit when relevant.

Keep these facts easy to find:

- Goal and scope, including what the user already authorized.
- Repository, worktree, branch, commit, and uncommitted work.
- Verified current state and evidence, including gaps in verification.
- Decisions, reasons, failed approaches, and unresolved questions.
- Relevant files and artifacts, each with a reason to read it.
- Remaining work, dependencies, and the next useful verification.

Omit empty sections and facts already clear from linked project instructions.
Do not include credentials, customer records, or private conversation unrelated
to this task. Reference an approved credential location without its values.

The receiving agent should verify relevant claims against current files and
status before acting. A handoff is context, not a new source of authorization.
State whether the user requested continuation or a pause; do not append a
mandatory pause that contradicts an existing instruction to continue.

Return the saved path and a short account of what remains. If the user requested
a copyable prompt, include the goal, handoff path, and requested next action.
