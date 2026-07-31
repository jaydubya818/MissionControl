---
status: complete
priority: p1
issue_id: "010"
tags: [tasks, accessibility, ui, design-system]
dependencies: ["009"]
---

# Close Task drawer accessibility debt

## Problem Statement

The accepted workflow-state cycle left deterministic evidence of serious color
contrast and touch-target failures in the Task drawer.

## Recommended Action

Adjust shared semantic tokens, use the existing Button system for Export Report,
enlarge the shared Sheet close target, and retain a focused Axe regression.

## Acceptance Criteria

- [x] WCAG AA contrast passes in dark and light themes.
- [x] Task drawer color-contrast and target-size scans pass.
- [x] Focused tests, typecheck, and build pass.
- [x] Before/after evidence and decisions are documented.

## Work Log

### 2026-07-31 - Evidence intake

**By:** Codex

**Actions:**
- Reproduced 19 Task drawer contrast nodes and one undersized close target on
  SFRL-089.
- Traced failures to one shared muted token, one hard-coded export color, and the
  shared Sheet close control.
- The first dark-theme fix passed completely; the light-theme verification then
  exposed four bright-on-light status/accent failures inherited from dark mode.

**Learnings:**
- Component-by-component color overrides would add unnecessary complexity; the
  semantic token is the correct fix boundary.
- Legacy Review history remains a separate data-governance problem and should not
  be fabricated as part of this visual cycle.

### 2026-07-31 - Implementation and verification

**By:** Codex

**Actions:**
- Raised dark/light muted tokens and added accessible light status/accent tokens.
- Replaced Export Report's hard-coded blue with the shared Button component.
- Enlarged and clarified the shared Sheet close control.
- Added and passed a deterministic dark/light Task drawer accessibility test.
- Passed 11 bounded assertions, workspace typecheck, production build, manual Axe
  scans, and a clean browser console/network pass.

**Learnings:**
- The Sheet uses a 400 ms transition, so automated contrast measurements must wait
  until colors settle; the intermediate failure trace is retained.
- Repeated mission-statement and model-routing runtime errors observed during local
  restart are unrelated and should drive the next reproduction-first cycle.
