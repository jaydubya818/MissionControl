---
title: Canonical Hierarchy Planning PR Validation
date: 2026-07-28
status: VERIFIED
owner: Quality Engineering
reviewer: Mission Control Platform
branch: codex/task-kanban-workorder-hierarchy
base: origin/main
---

# Canonical Hierarchy Planning PR Validation

## Scope

The planning branch was rewritten before publication to remove inherited
Mission-draft implementation commits. Its diff contains planning,
operator-facing documentation, documentation-route persistence, documentation
tests, and evidence only. It contains no Task-to-Work-Order schema work.

## Rebased planning commits

- `6fe7639` — preserve enhancement planning baseline
- `bc8340d` — plan Task and Work Order hierarchy
- `78d7219` — publish Software Factory Enhancement collection
- `3958076` — record operator publication mapping

## Full validation

| Command | Result |
| --- | --- |
| `pnpm run ci:prepare` | PASS |
| `pnpm test` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |

The first preparation attempt failed before compilation because this isolated
worktree had no installed dependencies. `pnpm install --frozen-lockfile`
restored the locked dependency graph; the exact validation sequence then
passed. This was an environment setup failure, not a repository regression.

The production build retains the existing warning for a chunk larger than
500 kB. No new build failure was introduced.

## Approved decisions reflected

- Goal → Mission → Work Order → Task → Attempt is canonical.
- Tasks remain the central execution Kanban surface.
- Work Orders remain governed delivery contracts.
- Attempts never become duplicate Task cards.
- Parentless Tasks are visible Ungoverned Inbox intake.
- Ungoverned Tasks cannot execute until linked.
- Automatic Quick Work Orders are deferred.

## Operational impact

No additional production monitoring is required for the planning documents.
The only runtime slice is persistent static Docs routing; monitor Docs error
boundary reports and invalid workspace queries during review.
