# Mission Control design system

Mission Control is an operator console. Its interface should feel calm, dense
without being cramped, and trustworthy under long sessions. Exceptions,
decisions, and evidence take priority over decorative agent activity.

## Product principles

- Use one clear primary action per decision area.
- Make state, owner, reason, and next action visible together.
- Prefer semantic tokens and shared components over local color values.
- Preserve information hierarchy without making secondary text unreadable.
- Provide loading, empty, error, success, disabled, and recovery states.
- Keep every workflow keyboard operable with a visible focus indicator.

## Semantic color contract

The v2 shell tokens live in `apps/mission-control-ui/src/index.css`.

| Purpose | Token |
|---|---|
| Primary text | `--text-primary` |
| Secondary text | `--text-secondary` |
| Muted metadata | `--text-muted` |
| Surfaces | `--surface-primary`, `--surface-secondary`, `--surface-elevated` |
| Status | `--status-success`, `--status-warning`, `--status-error`, `--status-info` |
| Primary action | `--action-primary`, `--action-primary-text` |
| Focus | `--focus-ring` / `--status-info` |

Do not add hard-coded colors to product controls when an existing semantic token
or shared component expresses the intent. Light mode must define its own status
and accent values; bright colors intended for dark surfaces are not portable.

## Accessibility requirements

- Normal text must meet WCAG AA contrast of at least 4.5:1 in both themes.
- Large text must meet at least 3:1.
- Controls and focus indicators must meet non-text contrast requirements.
- Pointer targets must be at least 24 by 24 CSS pixels; prefer 32 by 32 for dense
  desktop controls and 44 by 44 for coarse pointers.
- Disabled state must remain recognizable without relying on color alone.
- Status must include a text label or other non-color cue.
- Reduced-motion preferences must be honored.

## Verification

Every affected operator surface should be checked in dark and light themes with:

1. a focused screenshot at the target viewport;
2. Axe WCAG A/AA rules including WCAG 2.2 target size;
3. keyboard focus and close behavior;
4. browser console, page error, and failed-request capture;
5. a focused automated regression when the defect can recur through shared tokens.

Evidence and exceptions belong under `docs/testing/`; implementation decisions
belong under `docs/plans/` or `docs/architecture/` and must also be exposed in
Mission Control Docs when they affect operator behavior.

