# Mission Control design.md

This is the root design contract for Mission Control. It is the first file any coding agent or design workflow should read before creating or modifying UI.

Use this file to keep every screen calm, intentional, trustworthy, and unmistakably part of the same product.

## Product posture

- Build an operator-grade mission control surface, not a generic AI dashboard.
- Optimize for clarity, trust, and fast decision-making.
- Make state readable in under five seconds.
- Prefer high-signal composition over decorative complexity.

## Visual direction

- Tone: composed, technical, premium, restrained
- Metaphor: command deck, observability console, operator workstation
- Anti-goals:
  - purple-gradient AI slop
  - startup marketing gloss
  - playful consumer SaaS
  - noisy enterprise admin clutter

## Non-negotiable principles

1. State before decoration.
2. One surface should answer one primary question.
3. Keep hierarchy obvious: risk, stage, next action.
4. Use consistency to reduce cognitive load.
5. Show stale or missing data clearly.

## Layout rules

- Shell should feel like an operating system.
- Top chrome must stay disciplined. Avoid too many competing pills.
- Home should prioritize:
  1. what needs attention now
  2. what stage the build is in
  3. what the operator should do next
- Side rails are for context, not first-read critical state.

## Typography

- Display: geometric, technical, confident
- Body: highly readable, dense when needed
- Mono: timestamps, metrics, ids, machine context only

## Color roles

- Base: deep navy / blue-black command surfaces
- Primary: emerald for healthy progress and key action
- Secondary: cyan for selection, focus, and live data edges
- Warning: amber for review and degraded trust
- Error: restrained rose/red for blocked or failed states

## Component guidance

- Cards should earn their space.
- Buttons should feel precise, not flashy.
- Motion should indicate life, not perform theatrics.
- Hover states should be subtle and controlled.
- Use shadcn primitives as the accessibility and interaction base.

## Stitch / Claude workflow

1. Use this file as the locked design system before generating screens.
2. Curate references for hierarchy, typography, and density; do not copy layouts literally.
3. Approve the prototype before backend complexity expands.
4. Rebuild approved designs with real shadcn-based components.
5. Keep this file updated as the design system evolves.

## Extended reference

For the fuller human-readable design rationale, implementation notes, and extended guidance, also read:

- `docs/design.md`
