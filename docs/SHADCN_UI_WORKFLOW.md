# Mission Control shadcn/ui Workflow

Use this workflow when you want Mission Control UI work to be deliberate instead of ad hoc.

## Commands

From repo root:

```bash
pnpm run ui:shadcn add <component>
```

From the UI app:

```bash
cd apps/mission-control-ui
pnpm shadcn add <component>
```

## Ground Rules

- Add or update primitives in `apps/mission-control-ui/src/components/ui`
- Use `@/components/ui` and `@/lib/utils`
- Keep the theme anchored to `apps/mission-control-ui/src/index.css`
- Prefer extending existing Mission Control wrappers before adding net-new primitives
- Validate with:

```bash
pnpm --filter mission-control-ui typecheck
pnpm --filter mission-control-ui build
```

## Codex Plugin

The repo-local Codex plugin lives at:

- `plugins/mission-control-shadcn`

The skill you should invoke intentionally is:

- `shadcn-mission-control`

Use that skill whenever a request touches the Mission Control design system, dashboard shell, forms, dialogs, tables, or tabs.
