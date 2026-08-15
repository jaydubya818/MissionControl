# Feature flags

Mission Control gates major surfaces behind feature flags stored in Convex and env overrides.

## UI flags (Vite)

| Env var | Flag key |
| --- | --- |
| `VITE_FLAG_UI_SHELL_V2` | `ui.shell.v2` |
| `VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW` | `eos.command-center-preview` |
| `VITE_FLAG_CONTEXT_REGISTRY` | `context.registry` |
| `VITE_FLAG_COMPANY_CONTEXT` | `company.context` |

## Backend flags

| Flag | Effect |
| --- | --- |
| `context.registry` | Registry mutations and import pipeline |
| `eval.framework` | Eval gate on publish; banner on Registry Evals tab |
| `delivery.workorders` | WorkOrder read models and control plane |
| `executor.pi-bridge` | Pi runtime dispatch envelope |
| `company.context` | Company selector and company-scoped workspace administration |
| `factory-memory.hybrid` | Scoped ingestion and hybrid lexical, semantic, and code-aware retrieval |
| `factory-memory.relationships` | Typed Factory entity and relationship projection |
| `factory-memory.agentic-retrieval` | Bounded retrieval planner and sufficiency loop |
| `factory-memory.knowledge-graph` | Entity resolution, bounded traversal, and path inspection |
| `factory-memory.context-engine` | Frozen Attempt Context Packages, advisory verification influence, and context evals |

Factory Memory flags default off, must be set for a specific workspace, and
require Factory automation-management permission to change. Enable them in the
listed order. Disabling them preserves existing WorkOrder, Attempt,
verification, and acceptance behavior.

## Demo mode

`pnpm dev:demo` enables shell v2, EOS preview, and context registry in one command.
The demo seed also writes workspace-scoped Factory Memory phase flags and the
deterministic five-phase fixture.

Company-context local testing additionally requires
`MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` on the Convex backend. This is an
explicit demo adapter and must remain disabled in production.

Authentication is an independent deployment mode, not a feature flag. Keep
`VITE_AUTH_MODE` omitted or set to `legacy` during the compatibility rollout;
use `demo` only for local testing; and select `clerk` only after the Clerk UI
key and Convex issuer are configured. See the repository document
`docs/security/clerk-company-authorization.md`.

## Documentation

Full list: `docs/FEATURE_FLAGS.md` in repo root.

Query flags in UI via `useFlag()` hook from `convex/lib/flags.ts` projections.
