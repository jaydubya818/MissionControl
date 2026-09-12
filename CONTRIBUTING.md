# Contributing

Thanks for taking an interest. This project is maintained in the open and
outside contributions are welcome.

## Before you start

- **Small fixes** — typos, broken links, obvious bugs: open a pull request
  directly, no issue needed.
- **Anything larger** — new capability, a change in behavior, a refactor:
  open an issue first so we can agree on the shape before you spend time on it.
- Issues labeled `good first issue` are scoped small and safe to pick up
  without asking.

## Local development

This is a pnpm workspace. The package manager version is pinned in
`package.json` (`"packageManager": "pnpm@9.0.0"`), and a system pnpm 10.x will
not match it — use Corepack so you get the pinned version:

```sh
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm install --frozen-lockfile
```

### Build the workspace packages before typechecking or testing

Workspace packages resolve each other through their built `dist/` output —
`packages/shared` exports `./dist/index.d.ts`, not `src/`. If you typecheck a
package before its dependencies have been built, TypeScript reports:

```
error TS6305: Output file '.../packages/shared/dist/index.d.ts' has not been
built from source file '.../packages/shared/src/index.ts'.
```

That looks like a broken checkout but is only a missing build.
`pnpm run ci:prepare` builds the packages in dependency order. The root
`typecheck` and `test` scripts already run it for you; a per-package command
does not, so run it yourself first:

```sh
pnpm run ci:prepare
pnpm --filter @mission-control/policy-engine typecheck
```

### Verification commands

| Command | What it covers |
| --- | --- |
| `pnpm run typecheck` | `ci:prepare`, then `tsc --noEmit` across every workspace |
| `pnpm run lint` | `typecheck` plus `scripts/skill-lint.mjs` |
| `pnpm run test` | `ci:prepare`, every workspace test script, then the `convex/__tests__` suite |
| `pnpm run build` | Production build for every package that defines one |

Piping any of these through `tail`/`head` returns the *pipe's* exit status,
not the command's. Use `set -o pipefail` if a script checks the result.

## Pull requests

1. Fork the repo and create a branch off the default branch.
2. Keep the change focused. One concern per pull request.
3. Describe what changed and why in the PR body. If it changes behavior,
   say what a user will notice.
4. Make sure the project still builds and any existing tests pass
   (`pnpm run typecheck && pnpm run test`).

Pull requests are reviewed on a best-effort basis, usually within a few days.

## Reporting bugs

Open an issue with: what you ran, what you expected, what happened instead,
and your environment (OS, runtime version). A minimal reproduction is the
single most useful thing you can include.

## Code of conduct

Be straightforward and civil. Critique the work, not the person. Maintainers
may close or lock threads that stop being productive.

## License

By contributing, you agree that your contributions are licensed under the
MIT License that covers this project.
