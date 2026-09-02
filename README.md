# Mission Control

**A governed control plane for AI software factories.** Humans define intent and
approve consequential steps; agents do bounded work; deterministic code verifies
the result before anything reaches a pull request.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: active V1](https://img.shields.io/badge/status-active%20V1-orange.svg)](#project-status)
[![Runtime contract](https://img.shields.io/badge/runtime%20contract-v33-informational.svg)](docs/OVERVIEW.md)
[![Built with TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

![Mission Control Command Center showing portfolio metrics and ranked exceptions](docs/software-factory/screenshots/readme/mission-control-command-center.png)

## The problem

A coding agent finishes a task and reports success. That report is not evidence.
At one agent it does not matter much; at twenty it is the whole problem — nobody
can tell which changes were actually verified, which policies were respected, or
why a given diff exists.

Mission Control treats agent completion and verified success as two different
things, and refuses to conflate them.

## What it does

- **Governed intake.** A Mission carries a specification and an approved Plan
  before any agent is dispatched. Consequential steps stop at a human gate.
- **Bounded execution.** Work runs through one execution-only harness contract
  with explicit capability admission, local or remote-sandboxed.
- **Independent verification.** Quality Contracts are checked by code that did
  not produce the change, fail-closed, before a candidate is accepted.
- **Evidence, not assertions.** Every WorkOrder carries its traces, approvals,
  and verification records, and the resulting pull request is exact-current.

## Persona access control

Mission Control uses four versioned access profiles across the Agentic Platform
and Software Factory. Clerk authenticates people; Mission Control remains the
authorization source of truth for permissions and company, workspace, and team
scope.

| Persona | Default operating focus |
| --- | --- |
| Executive | Value, risk, governance, and accountable autonomy |
| Architect | Complete-system visibility, boundaries, and contracts |
| Builder | Delivery, diagnosis, and the path from failure to recovery |
| Admin | All capabilities plus profile defaults, assignments, rollout, and recovery |

Admins manage these defaults under **Settings → Access Profiles** and assign one
primary persona plus a valid scope under **Company Access**. Profile changes are
previewed, versioned, audited, and recoverable. Navigation filtering is an
experience control, not a security boundary: server enforcement remains in
`SHADOW` until every live domain uses the same permission and scope checks.

See the [persona access decision](docs/decisions/persona-access-profiles.md) and
[rollout runbook](docs/security/persona-access-profile-rollout.md) for the full
permission model, migration, rollback, and final-Admin protections.

## Quickstart

Requires Node 20, pnpm 9, and a Convex development deployment.

```bash
git clone https://github.com/jaydubya818/MissionControl.git
cd MissionControl
corepack enable && pnpm install
cp .env.example .env.local
pnpm exec convex dev --once     # creates/links a Convex dev deployment
pnpm run dev
```

Set the generated `CONVEX_URL` as `VITE_CONVEX_URL` in `.env.local`, then open
<http://localhost:5173>.

### Or run the deterministic demo

```bash
pnpm run dev:demo                       # terminal 1
pnpm run convex:seed:demo:force         # terminal 2
```

Open <http://localhost:5199/v2/command-center> and select **Software Factory
Demo** (`sf-demo`) to watch a full Mission move through plan, execution,
verification, and acceptance with no external providers involved.

### Verify a hosted preview

Hosted end-to-end verification must use a non-production Convex deployment and
must not disable Vercel Deployment Protection. Configure the preview branch with
its development or preview `VITE_CONVEX_URL`, enable the required V2 and company
context feature flags, and use a dedicated Vercel automation-bypass secret in
the `x-vercel-protection-bypass` request header. Never commit the bypass secret
or a Convex deploy key.

The preview is ready for RBAC verification only when the UI and Convex functions
were built from the same commit, the browser reaches Mission Control rather than
the Vercel login page, and the Executive, Architect, Builder, and Admin routes
are verified against scoped non-production data. Production is not a preview
test target.

## The lifecycle

Canonical builder loop:

> Intent → Plan → Configure agents, harnesses, skills, and tools → Execute → Verify and evaluate → Deliver → Observe → Improve

Governed delivery lifecycle:

> Mission → approved Plan → WorkOrder → Task → Attempt → candidate → independent evidence → pull request → human decision → release → observed outcome → governed learning

Each arrow is a gate, not a handoff. Nothing advances on an agent's word.

![Validated Mission with complete assertion coverage](docs/testing/evidence/real-codex-github-pr-golden-path/mission-validated-pr-61.png)

## Project status

Active V1 development. The repository carries a deterministic full-system V1
qualification with documented limitations: governed intent, Factory
configuration, worker admission, local and bounded live-remote execution,
immutable candidates, independent verification, exact pull-request currentness,
canonical WorkOrder acceptance, and a human-gated learning continuation all
compose end to end.

That is implementation proof. It is **not** a claim of fleet-scale production
operation or general Remote Sandbox certification. Remote Sandbox is
**Production-pilot eligible; Preview**. The bounded 3/3 live exe.dev cohort is
not general production certification. The current public client/backend runtime contract is **v33**.

Per-capability status, evidence, and promotion gates live in the
[Capability Maturity Ledger](docs/product/software-factory-capability-maturity.md).

## Documentation

| Document | What's in it |
| --- | --- |
| [Full overview](docs/OVERVIEW.md) | The complete design rationale, capability-by-capability implementation detail, governance model, and security boundaries. Start here if you want the whole argument. |
| [Architecture](docs/ARCHITECTURE.md) | System architecture and repository map. |
| [Run the demo](docs/site/get-started/run-the-demo.md) | Step-by-step demo walkthrough. |
| [Run commands](docs/guides/RUN.md) | Every supported run mode and profile. |
| [Persona RBAC rollout](docs/security/persona-access-profile-rollout.md) | Access-profile permissions, scopes, SHADOW rollout, rollback, and hosted verification requirements. |
| [Golden-path proof](docs/testing/evidence/real-codex-github-pr-golden-path/README.md) | A real Codex-to-GitHub pull request, produced and verified through the browser UI. |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Issues labeled `good first issue` are scoped small and safe to pick up without
asking first.

## License

MIT — see [LICENSE](LICENSE).
