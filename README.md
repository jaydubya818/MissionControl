# Mission Control

**A governed control plane for AI software factories.** Humans define intent and
approve consequential steps; agents do bounded work; deterministic code verifies
the result before anything reaches a pull request.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: active V1](https://img.shields.io/badge/status-active%20V1-orange.svg)](#project-status)
[![Runtime contract](https://img.shields.io/badge/runtime%20contract-v34-informational.svg)](docs/OVERVIEW.md)
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

## The lifecycle

```
Constitution → Mission → Specification → Plan → WorkOrder → Context
   → Execution → Verification → Pull Request → Human Acceptance → Learning
```

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
operation or general Remote Sandbox certification. Current public
client/backend runtime contract: **v34**.

Per-capability status, evidence, and promotion gates live in the
[Capability Maturity Ledger](docs/product/software-factory-capability-maturity.md).

## Documentation

| Document | What's in it |
| --- | --- |
| [Full overview](docs/OVERVIEW.md) | The complete design rationale, capability-by-capability implementation detail, governance model, and security boundaries. Start here if you want the whole argument. |
| [Architecture](docs/ARCHITECTURE.md) | System architecture and repository map. |
| [Run the demo](docs/site/get-started/run-the-demo.md) | Step-by-step demo walkthrough. |
| [Run commands](docs/guides/RUN.md) | Every supported run mode and profile. |
| [Golden-path proof](docs/testing/evidence/real-codex-github-pr-golden-path/README.md) | A real Codex-to-GitHub pull request, produced and verified through the browser UI. |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Issues labeled `good first issue` are scoped small and safe to pick up without
asking first.

## License

MIT — see [LICENSE](LICENSE).
