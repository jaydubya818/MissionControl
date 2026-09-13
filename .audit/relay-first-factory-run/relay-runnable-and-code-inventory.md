# Relay runnable and code inventory checkpoint

Checkpoint captured: 2026-09-12T22:05:47-07:00

Repository inspected: `/Users/jaywest/factory-pilot`

Accepted/main revision: `c55c80b11b30939d73487dcd66ccfbb68f211de1`

Preserved candidate revision: `394414750427c9ea12fe51e46a0b17007691209f`

## Executive conclusion

- `main` is a specification repository at this checkpoint. It has no application manifest, source tree, lockfile, or runnable server.
- Candidate `3944147` is an **unmerged and unaccepted** foundation commit, exactly one commit ahead of `main`. It adds a minimal standalone Next.js application, a placeholder home page, and a typed health endpoint.
- The candidate is not Relay V1. It does not contain the domain, authorization, capability, connector, MCP, audit, dashboard, qualification, or release work defined by the Relay specification.
- No Relay checkout, preserved candidate, dependency tree, build output, or evidence directory was changed while producing this checkpoint.

## Repository and worktree identity

| Role | Path | Revision | Git state |
| --- | --- | --- | --- |
| Accepted repository | `/Users/jaywest/factory-pilot` | `c55c80b11b30939d73487dcd66ccfbb68f211de1` | `main` |
| Candidate source worktree | `/Users/jaywest/factory-pilot/.mission-control/worktrees/aeha4n8e9x37-ojwqn3k9` | `394414750427c9ea12fe51e46a0b17007691209f` | `mc/aeha4n8e9x37-ojwqn3k9` |
| Preserved verification mirror | `/Users/jaywest/factory-pilot/.mission-control/worktrees/verify-12n3z309` | `394414750427c9ea12fe51e46a0b17007691209f` | detached HEAD |

Evidence:

- `git rev-list --left-right --count c55c80b11b30939d73487dcd66ccfbb68f211de1...394414750427c9ea12fe51e46a0b17007691209f` returned `0 1`.
- The candidate parent is `c55c80b11b30939d73487dcd66ccfbb68f211de1`.
- `git branch --contains 394414750427c9ea12fe51e46a0b17007691209f` contains only `mc/aeha4n8e9x37-ojwqn3k9`; `main` does not contain the candidate.
- Candidate commit subject: `Repository + Technical Foundation`, authored by the repository operator on 2026-09-12T21:35:42-07:00.
- The source candidate has neither `node_modules/` nor `.next/`. The detached verification mirror has both plus an ignored `tsconfig.tsbuildinfo`; those artifacts were preserved and were not reused as acceptance evidence.
- Both source checkouts report only the pre-existing untracked `.mission-control/` worktree machinery. It is not part of the candidate diff.

## Exact current runnable instructions

### Accepted `main`

There is no application to run at `main` revision `c55c80b`. Its tracked files are only:

```text
LICENSE
README.md
docs/RELAY-V1-SPEC.md
```

Consequently, commands such as `pnpm install`, `pnpm dev`, or `pnpm build` are not valid from the accepted checkout. The current accepted artifact can only be read as documentation.

### Preserved candidate

Do not run dependency installation or builds in either preserved candidate worktree. Materialize the exact commit into a disposable checkout so the source candidate and its evidence remain unchanged:

```bash
relay_run_root="$(mktemp -d /tmp/relay-foundation-3944147.XXXXXX)"
git clone --no-local /Users/jaywest/factory-pilot "$relay_run_root"
git -C "$relay_run_root" checkout --detach 394414750427c9ea12fe51e46a0b17007691209f
cd "$relay_run_root"
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsc --noEmit
corepack pnpm run build
corepack pnpm start
```

In another terminal, verify the only implemented API contract:

```bash
curl --fail --silent http://127.0.0.1:3000/api/health
```

Expected response:

```json
{"ok":true}
```

The placeholder UI is at `http://127.0.0.1:3000/` and renders `Relay is online.`. For development mode, replace the build/start pair with:

```bash
corepack pnpm dev
```

Runtime prerequisites declared by the candidate are Node `>=20.9.0` and Corepack-managed `pnpm@9.0.0`. The checkpoint host reports Node `v24.18.1`, Corepack `0.35.0`, and pnpm `9.0.0`.

The candidate README also documents `corepack pnpm install --frozen-lockfile --offline` for verification. That command requires an already populated pnpm store; it is not a reliable first-run command in a clean checkout. The online frozen-lockfile install above is the deterministic clean-checkout path. There is no `test` script in the candidate manifest.

## Implemented inventory

### Accepted `main`

| Area | Implemented state | Evidence |
| --- | --- | --- |
| Product specification | Relay V1 Mission Spec through section 215 | `docs/RELAY-V1-SPEC.md`; commit `c55c80b` |
| Repository positioning | Relay is standalone and has no runtime dependency on Mission Control | `README.md` lines 3–13 |
| Work breakdown | WO-001 through WO-014 and dependencies are specified | `docs/RELAY-V1-SPEC.md` lines 370–397 |
| Runtime application | Not implemented | No `package.json`, `app/`, `src/`, or lockfile exists on `main` |

The specification identifies WO-001 as the Next.js App Router and `/api/health` foundation, with domain models, dashboard, MCP, and qualification following it (`docs/RELAY-V1-SPEC.md` lines 120–130 and 370–397). None of that implementation is accepted on `main` at this checkpoint.

### Unaccepted candidate `3944147`

The candidate changes 10 files relative to `main` with 344 insertions and 26 deletions:

| File | Implemented behavior | Evidence |
| --- | --- | --- |
| `.gitignore` | Ignores dependencies, Next build output, exports, and TypeScript build metadata | Candidate file and commit diff |
| `README.md` | Documents Node/Corepack prerequisites, install, dev, health, typecheck, and build commands | Candidate `README.md` lines 5–30 |
| `app/api/health/route.ts` | Implements typed `GET /api/health` returning JSON `{ ok: true }` | Candidate source |
| `app/layout.tsx` | Supplies root App Router layout, English document language, and basic Relay metadata | Candidate source |
| `app/page.tsx` | Supplies placeholder root route with `Relay is online.` | Candidate source |
| `next-env.d.ts` | Supplies Next.js TypeScript references | Candidate source |
| `package.json` | Pins package manager, runtime requirements, scripts, and the minimal Next/React dependency set | Candidate manifest |
| `pnpm-lock.yaml` | Locks the dependency graph with lockfile version 9 | Candidate lockfile |
| `pnpm-workspace.yaml` | Declares the repository root as the sole workspace package | Candidate source |
| `tsconfig.json` | Enables strict, no-emit TypeScript checking and the Next App Router plugin | Candidate source |

Candidate dependency and script details:

- Production dependencies: `next@15.5.22`, `react@19.1.0`, and `react-dom@19.1.0`.
- Development dependencies: TypeScript `5.9.2` and React/Node type packages.
- Scripts: `dev`, `build`, `start`, and `typecheck` only.
- A source/dependency scan found no Mission Control or FDLC runtime import or package dependency in the scaffold. This supports isolation of this small foundation only; it is not a full Relay isolation qualification.

## Explicitly not implemented in the candidate

The candidate's complete application source is limited to the root layout, placeholder page, and health route. There is no implementation or test artifact for:

- persistent domain models or database storage;
- account authentication or authorization;
- agent identities or runtime connections;
- capability catalog, grants, scopes, leases, or policy enforcement;
- MCP gateway, API surface beyond health, webhooks, or event delivery;
- production dashboard shell, navigation, responsive behavior, or design system;
- memory, connector, sandbox, browser, or computer integrations;
- activity stream, audit ledger, execution receipts, or evidence UX;
- security, accessibility, contract, performance, unit, integration, or end-to-end tests;
- release qualification or production deployment configuration.

This is therefore a narrow WO-001-style repository foundation, not evidence that WO-002 through WO-014 or Relay V1 are complete.

## Verification and evidence state

- `git show --check 394414750427c9ea12fe51e46a0b17007691209f` and `git diff --check c55c80b11b30939d73487dcd66ccfbb68f211de1..394414750427c9ea12fe51e46a0b17007691209f` reported no whitespace errors.
- File/tree identity, parentage, manifest contents, source contents, and absence claims were verified read-only against the accepted and candidate revisions.
- Typecheck, build, server startup, and browser behavior were **not re-run** during this checkpoint because doing so in a preserved worktree would create or modify dependency/build artifacts. The commands above are derived from the exact candidate manifest and README and should be executed in the disposable checkout before accepting the candidate.
- Existing `.next/`, `node_modules/`, and `tsconfig.tsbuildinfo` in the detached verification mirror show that another process materialized it. Their presence alone does not establish which commands passed, when they passed, or that the candidate meets the specification.

## Preservation note

This checkpoint performed only read operations in `/Users/jaywest/factory-pilot` and its worktrees. It did not install dependencies, start Relay, dispatch a work order, modify a branch, remove an artifact, or change preserved evidence. The only write is this Mission Control audit document.
