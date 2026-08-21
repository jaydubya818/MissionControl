# Feature Flags

Runtime toggles gating incomplete or risky Software Factory subsystems. Introduced in PR 0 (`sf/00-hygiene-flags`).

## Model

- **Storage:** Convex `featureFlags` table (`convex/schema.ts`). One row per key per scope.
- **Registry + resolution:** `convex/lib/flags.ts` (pure, unit tested in `convex/__tests__/featureFlags.test.ts`).
- **Convex surface:** `convex/featureFlags.ts` — `list`, `isEnabled`, `setFlag`.
- **Audit:** every `setFlag` writes an `activities` row (`action: FEATURE_FLAG_SET`) with before/after state.

## Resolution precedence (highest wins)

1. `VITE_FLAG_<KEY>` env override (UI only — CI and local dev; dots/dashes → underscores, uppercased)
2. Project-scoped row (`projectId` set)
3. Global row (no `projectId`)
4. Registered default from `KNOWN_FLAGS` — **every** registered flag currently ships `defaultEnabled: false`, asserted by `convex/__tests__/featureFlags.test.ts`
5. Unknown keys resolve to `false` — never throw

## Registered flags

| Key | Gates | Introduced |
|-----|-------|-----------|
| `ui.shell.v2` | Left-sidebar AppShell + router navigation. Registered but never read; the live gate is the unregistered `ui.shell.v1` opt-out in `App.tsx` | PR 1 |
| `context.registry` | Context package registry backend + UI. Defaults **off**, and no production code currently reads it — the shell decision was inverted to the opt-out `ui.shell.v1`, so the `VITE_FLAG_CONTEXT_REGISTRY` / `VITE_FLAG_UI_SHELL_V2` overrides set by `dev:demo` and `playwright.config.ts` are inert | PR 2, 18 |
| `context.cbom` | Context Bill of Materials snapshot at run start | PR 6 |
| `context.gates` | Context quality gates blocking publication | PR 10 |
| `eval.framework` | Baseline/candidate evaluation execution | PR 7–9 |
| `security.scanning` | Context/skill security scan pipeline | PR 11 |
| `dispatch.v2` | Context-aware dispatch scoring | PR 14 |
| `trust.scoring` | Agent trust scores and constraints | PR 15 |
| `rollout.rings` | Context rollout rings 0–4 | PR 17 |
| `delivery.workorders` | Work order delivery control plane | PR 2a, 21 |
| `missions.plan-release-v1` | Versioned Mission planning, decisions, and atomic WorkOrder release | Mission P0.2 |
| `eos.command-center-preview` | Engineering OS Command Center, missions, intelligence views | EOS demo |
| `executor.pi-bridge` | Pi runtime receipt packet ingestion and orchestration dispatch envelope | Factory runtime |
| `ui.control.stubs` | Preview-only Control nav items (Portfolio, Fleet) | Factory UI S5 |
| `company.context` | Auth-resolved company selection and company-scoped workspace administration | Company boundary P0 |
| `control-plane.repository-projection` | Repository connections and governed monorepo code scopes | Company control plane |
| `control-plane.role-lenses` | My, Team, Workspace, and Company Command Center lenses | Company control plane |
| `control-plane.company-rollups` | Authorized cross-workspace company portfolio totals | Company control plane |
| `control-plane.team-authorization` | Record-level Mission and WorkOrder team/owner enforcement | Company control plane |
| `control-plane.dispatch-scope` | Repository, code-scope, team, owner, environment, and host dispatch checks | Company control plane |

## Usage

**UI (React):**

```tsx
import { useFlag } from "./hooks/useFlag";

const shellV2 = useFlag("ui.shell.v2");
if (shellV2) return <AppShellV2 />;
```

**Convex functions:**

```ts
import { resolveFlag } from "./lib/flags";
// load rows via the by_key index, then:
const { enabled } = resolveFlag(rows, "context.cbom", projectId);
```

**CLI:**

```bash
mc flags                       # list all flags with resolved state
mc flags set ui.shell.v2 on    # enable globally (audited)
mc flags set ui.shell.v2 off
```

The `control-plane.*` flags are a security boundary and cannot be written globally. Set them through `featureFlags:setFlag` with an explicit `projectId` and a workspace-management identity, following the activation order in `docs/operations/company-control-plane-runbook.md`.

**CI / local env override (UI only):**

```bash
VITE_FLAG_UI_SHELL_V2=true pnpm run dev:ui
```

For local company-context testing, enable both the UI rollout flag and the
explicit backend demo adapter:

```bash
VITE_FLAG_COMPANY_CONTEXT=true
MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1
```

`MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT` must never be enabled in production. With
the adapter disabled, company access resolves only from authenticated operator
records linked by `authId`.

## Human authentication rollout

Authentication is selected separately from feature flags so a failed identity
provider cannot silently turn into demo access:

| `VITE_AUTH_MODE` | Behavior |
| --- | --- |
| omitted or `legacy` | Existing provider behavior during the staged rollout |
| `demo` | Explicit local company administrator adapter; never production |
| `clerk` | Clerk session plus Convex token validation |

Clerk mode requires `VITE_CLERK_PUBLISHABLE_KEY` in the UI build and the public
Clerk issuer in `convex/auth.config.ts`. An explicitly selected Clerk mode with
missing UI configuration fails closed. See
`docs/security/clerk-company-authorization.md` for setup and rollout checks.

## Lifecycle convention

1. Flag ships **default-off** in the PR that introduces its subsystem.
2. Flips on (global row) after the subsystem's E2E flow passes.
3. Flag and dead branch removed **at most two PRs** after the flip.
4. Register new keys in `KNOWN_FLAGS` (`convex/lib/flags.ts`) — ad-hoc keys work but show without descriptions.
