# Mission Control `design.md`

This is the extended design reference for Mission Control. The root-level `design.md` is the canonical agent entrypoint; this document expands on it for humans and longer-form design review.

## Product intent

- Build an AI-native operations surface that feels calm, decisive, and trustworthy.
- Avoid generic “AI dashboard” aesthetics.
- Favor a premium command-center tone over startup marketing gloss.
- Make operational state readable in under five seconds.

## Brand posture

- Personality: composed, technical, high-signal, never noisy
- Visual metaphor: mission control, operator deck, build pipeline, instrument cluster
- Emotional target: confidence, clarity, control
- Anti-goals:
  - playful consumer SaaS
  - purple-gradient AI slop
  - overly glossy crypto aesthetic
  - sterile enterprise admin UI

## Core design principles

1. State before decoration.
2. Hierarchy should answer the next operator decision.
3. One strong accent is better than five weak ones.
4. Motion should signal system life, not show off.
5. Typography should feel intentional and engineered.

## Color system

### Base surfaces

- Background: deep blue-black command deck
- Panels: dark glass surfaces with restrained elevation
- Elevated panels: slightly brighter navy for hierarchy shifts
- Borders: low-contrast cyan-tinted lines, never bright outlines by default

### Accent roles

- Primary accent: emerald for healthy progress, primary CTA, live success
- Secondary accent: cyan for selection, data edges, focus, and shell framing
- Warning: amber for review-needed and degraded trust
- Error: restrained red for blocked, failed, or dangerous states

### Color behavior

- Keep primary and secondary accents isolated to important interactions and signal states.
- Do not use magenta or purple as the default app accent.
- Avoid full-bleed saturated gradients; use radial atmospheric lighting instead.

## Typography

- Display font: geometric, futuristic, legible in uppercase labels
- Body font: highly readable sans for dense operator surfaces
- Mono font: reserved for timestamps, metrics, ids, and machine context

### Type usage

- Kicker labels: uppercase, wide tracking, quiet cyan-muted tone
- Headings: strong but not theatrical
- Metrics: large, tabular, compressed tracking
- Body copy: concise, low-friction, readable at dashboard density

## Layout rules

- The shell should feel like an operating system, not a landing page.
- Home should prioritize:
  1. risk and blockers
  2. current build stage
  3. next operator action
- Side rails should carry secondary context, not critical first-read state.
- Cards should earn their space with decision-making value.
- Empty space should create calm, not dead zones.

## Component direction

### Cards

- Rounded, dark, glass-like, slightly illuminated
- Use subtle inner highlight and depth
- Hover should feel precise and controlled, never floaty

### Navigation

- Dense but scannable
- Active state should be clearly machine-lit
- Secondary nav should feel quieter than primary nav

### Status indicators

- Active: emerald pulse
- Thinking/warm: amber
- Idle/ready: cyan-neutral
- Stale/offline: subdued zinc, never dramatic unless the problem is urgent

### Buttons

- Primary: emerald or cyan depending on action class
- Secondary: outlined glass
- Avoid generic flat gray buttons

## Motion

- Use soft pulse, glow drift, subtle state transitions
- Avoid bouncy motion
- Prefer:
  - fade + slight translate
  - pulse on live indicators
  - targeted hover lighting
- Motion must respect reduced-motion settings

## Image and illustration guidance

- Prefer system diagrams, abstract maps, signal lines, or operational illustrations
- Avoid cheesy robot art and generic AI faces
- Use visuals to imply networked intelligence and controlled execution

## Redesign/reference guidance

- When borrowing from a reference site, extract:
  - spacing rhythm
  - hierarchy
  - component density
  - typography relationships
- Do not copy layouts literally.
- Build an original composition inside Mission Control’s own design language.

## Stitch / agent workflow guidance

- Treat this file as the source design contract for any generative design workflow.
- If using Stitch or another design generator:
  1. lock the visual system here first
  2. generate variations against this contract
  3. review for originality and operator fit
  4. convert approved output into shadcn-based components
- Prototype approval should happen before backend complexity expands.

## shadcn implementation guidance

- Prefer shadcn primitives for accessibility and interaction behavior.
- Layer Mission Control styling through tokens and wrappers rather than fragmenting the component system.
- If using external registries, favor:
  - glassmorphism
  - motion primitives
  - components that feel premium but operational

## Success test

The UI is correct when:

- a new page still feels unmistakably like Mission Control
- an operator can identify the current state quickly
- the interface feels premium without feeling flashy
- generated work does not collapse into generic AI app aesthetics
