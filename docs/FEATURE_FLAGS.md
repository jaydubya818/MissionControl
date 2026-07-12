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
4. Registered default from `KNOWN_FLAGS` (`false` for new subsystems; `context.registry` now defaults to `true` — the registry is the primary skills surface)
5. Unknown keys resolve to `false` — never throw

## Registered flags

| Key | Gates | Introduced |
|-----|-------|-----------|
| `ui.shell.v2` | Left-sidebar AppShell + router navigation | PR 1 |
| `context.registry` | Context package registry backend + UI (defaults **on**; RegistryView is the only skills surface) | PR 2, 18 |
| `context.cbom` | Context Bill of Materials snapshot at run start | PR 6 |
| `context.gates` | Context quality gates blocking publication | PR 10 |
| `eval.framework` | Baseline/candidate evaluation execution | PR 7–9 |
| `security.scanning` | Context/skill security scan pipeline | PR 11 |
| `dispatch.v2` | Context-aware dispatch scoring | PR 14 |
| `trust.scoring` | Agent trust scores and constraints | PR 15 |
| `rollout.rings` | Context rollout rings 0–4 | PR 17 |
| `delivery.workorders` | Work order delivery control plane | PR 2a, 21 |
| `eos.command-center-preview` | Engineering OS Command Center, missions, intelligence views | EOS demo |
| `ui.control.stubs` | Preview-only Control nav items (Portfolio, Fleet) | Factory UI S5 |

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

**CI / local env override (UI only):**

```bash
VITE_FLAG_UI_SHELL_V2=true pnpm run dev:ui
```

## Lifecycle convention

1. Flag ships **default-off** in the PR that introduces its subsystem.
2. Flips on (global row) after the subsystem's E2E flow passes.
3. Flag and dead branch removed **at most two PRs** after the flip.
4. Register new keys in `KNOWN_FLAGS` (`convex/lib/flags.ts`) — ad-hoc keys work but show without descriptions.
