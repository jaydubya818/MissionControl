---
title: "fix: Close Task drawer accessibility debt"
type: fix
status: complete
date: 2026-07-31
branch: codex/task-drawer-contrast-pr4
priority: P1
related_prs: [50]
---

# Task drawer accessibility cleanup

## Problem

The workflow-state browser evidence found zero critical Axe violations but 24
serious findings in the existing Task drawer. A deterministic follow-up scan on
SFRL-089 reproduced 19 color-contrast nodes and one undersized close target.
Operators must be able to read and close the primary Task detail surface without
depending on unusually high visual acuity or precise pointer control.

## Decision

Fix the shared semantic tokens and two offending controls instead of adding
one-off Task drawer overrides:

- raise dark and light `text-muted` colors above WCAG AA on both primary and
  secondary surfaces while retaining clear hierarchy below secondary text;
- provide light-theme success, warning, error, info, and registry accent tokens
  instead of inheriting bright-on-dark values;
- replace the hard-coded blue Export Report control with the existing Button
  component and semantic action tokens;
- make the shared Sheet close control at least 32 by 32 CSS pixels;
- add a focused deterministic accessibility regression that asserts the Task
  drawer has no color-contrast or target-size violations;
- make no workflow, data, or navigation changes.

## Baseline evidence

| Finding | Baseline |
|---|---:|
| Color-contrast nodes in SFRL-089 drawer | 19 |
| Muted dark contrast on primary surface | 4.11:1 |
| Muted dark contrast on secondary surface | 3.89:1 |
| Export Report contrast | 3.67:1 |
| Sheet close target | 16 × 16 px |

## Acceptance criteria

- [x] Dark muted text is at least 4.5:1 on primary and secondary surfaces.
- [x] Light muted text is at least 4.5:1 on primary and secondary surfaces.
- [x] Export Report uses semantic Button styling and passes color contrast.
- [x] Sheet close target is at least 24 × 24 CSS pixels.
- [x] Focus state and visual hierarchy remain clear.
- [x] Focused Axe scan reports zero color-contrast and target-size violations.
- [x] Task drawer screenshot remains calm, legible, and consistent with the v2 shell.
- [x] Typecheck, production build, and relevant focused tests pass.

## Scope and rollback

The change is limited to semantic color tokens and shared controls. Rollback is a
normal code revert; no persistent data or backend contract changes are involved.
