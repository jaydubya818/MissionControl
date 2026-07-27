# Set up Mission Control

## Prerequisites

- Node.js 18+
- pnpm 9+
- Convex account (or self-hosted deployment)

## Clone and install

```bash
git clone https://github.com/jaydubya818/MissionControl.git
cd MissionControl
pnpm install
```

## Environment

Copy `.env.example` to `.env.local` and set:

- `CONVEX_DEPLOYMENT` — your Convex deployment name
- `VITE_CONVEX_URL` — Convex URL for the UI

## Start development

```bash
# Standard UI + Convex
pnpm dev

# EOS Command Center preview (port 5199) with registry + harness flags
pnpm dev:demo
```

## Seed demo data

Populate every operator-facing page with cross-linked demo rows:

```bash
pnpm convex:seed:demo:force
```

Optional — agent memory documents:

```bash
pnpm convex:seed:demo:full
```

After seeding, open **Knowledge → Docs** or navigate the EOS sidebar. Expect badge counts roughly: Tasks ~57, Execution ~52, Incidents ~104, Registry 9, Memory 9.

## Enable feature flags

Key flags (see [Feature flags](../reference/feature-flags.md)):

| Flag | Enables |
| --- | --- |
| `ui.shell.v2` | Shell v2 layout |
| `eos.command-center-preview` | Engineering OS navigation |
| `context.registry` | Registry CRUD and import |
| `eval.framework` | Eval gate on publish |

In demo mode these are set via `VITE_FLAG_*` env vars in `pnpm dev:demo`.

## Next steps

- [Run the demo walkthrough](./run-the-demo.md)
- [Improve your first skill](./improve-your-first-skill.md)
