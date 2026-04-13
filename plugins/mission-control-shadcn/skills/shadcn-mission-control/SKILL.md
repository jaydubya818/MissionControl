---
name: shadcn-mission-control
description: Use this skill when adding or adapting shadcn/ui inside SellerFi Mission Control so UI work follows the repo's design system instead of ad hoc copy-paste.
---

# shadcn Mission Control

This skill exists to keep Mission Control UI work intentional.

Use it whenever the task involves:

- adding a new `shadcn/ui` primitive
- refactoring hand-rolled UI onto `shadcn` primitives
- extending the dashboard shell, dialogs, forms, tables, tabs, or navigation
- reviewing whether a new component fits the Mission Control design system

## Repo Facts

- UI app: `apps/mission-control-ui`
- Stack: React 18 + Vite + Tailwind CSS v4
- shadcn config: `apps/mission-control-ui/components.json`
- theme tokens: `apps/mission-control-ui/src/index.css`
- shared UI primitives: `apps/mission-control-ui/src/components/ui`
- local alias: `@/` resolves to `apps/mission-control-ui/src`

## Default Workflow

1. Check the existing primitive before adding anything new.
   - Look in `apps/mission-control-ui/src/components/ui`
   - Prefer extending existing `button`, `card`, `dialog`, `tabs`, `table`, `input`, `select`

2. Use the repo command path instead of ad hoc snippets.
   - From repo root: `pnpm run ui:shadcn add <component>`
   - From the app: `pnpm shadcn add <component>`

3. Keep generated code inside the Mission Control UI app.
   - New primitives go in `apps/mission-control-ui/src/components/ui`
   - Shared helpers stay in `apps/mission-control-ui/src/lib`

4. Adapt the generated component to the Mission Control shell.
   - Use the CSS variables in `src/index.css`
   - Match the existing rounded geometry, blur, glass surfaces, and cyan/emerald accents
   - Favor calm, trustworthy operator UX over novelty for novelty's sake

5. Validate the result.
   - `pnpm --filter mission-control-ui typecheck`
   - `pnpm --filter mission-control-ui build`
   - Review visually if the touched surface is operator-facing

## Rules

- Do not introduce a second component system beside `shadcn/ui`
- Do not add one-off inline styling when the design token already exists
- Do not copy random registry snippets without reconciling imports, aliases, and theme tokens
- Do not add a new primitive if an existing Mission Control wrapper already solves the need
- If the shadcn CLI cannot run, fall back to official component structure and adapt it manually

## Design Standard

Mission Control should feel:

- calm
- precise
- operational
- modern
- trustworthy

That means:

- crisp information density
- explicit empty/loading/error states
- restrained motion
- strong typography hierarchy
- consistent shell styling across nav, tabs, headers, and cards

## When To Push Back

Push back if the request would:

- duplicate an existing panel pattern
- add a flashy surface that weakens trust
- scatter component logic outside `apps/mission-control-ui/src/components/ui`
- create more UI variation than the operator actually needs
