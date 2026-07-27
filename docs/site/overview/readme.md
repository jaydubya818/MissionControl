# What is Mission Control?

> **Takeaways**
>
> - Mission Control is the operator control plane for an **agentic software factory**.
> - Six platform components mirror Tessl-style context-as-code, but wired to Convex, WorkOrders, and governed execution.
> - Start with demo seed data, then adopt one workflow at a time.

Mission Control is an open orchestration and observability platform for managing AI agent squads at production scale. It takes you from ad-hoc agent chat to a **governed software factory** — one WorkOrder, one receipt, and one merge gate at a time.

The platform works with every popular coding agent (Cursor, Claude Code, Codex, Pi) and is made up of six components:

| Component | What it is |
| --- | --- |
| **Registry & package manager** | Discover, install, version, and roll back skills and context packages. One searchable index (`scope/name`) with published versions, content hashes, and install state per repo. |
| **Governance** | ARM policies, identity envelopes, deployment records, and QC rulesets. RBAC, approval gates, and audit trails for risky tool calls and factory writeback. |
| **Evals** | Measure a skill's impact with scenario-based eval runs — baseline vs candidate scoring before publish. Meta-loop suggestions turn failures into new verifiers and scenarios. |
| **Software factory** | WorkOrders as the unit of value: desired outcome, acceptance criteria, verification receipts, and governed dispatch to Pi/Hermes runtimes. |
| **Observability** | Command Center, Factory Health, trace inspector, incidents, and cost attribution across runs, tool calls, and human interventions. |
| **Harness engineering** | Change review lenses, mutation testing, merge gates, architect-mode adoption metrics, and the seven-step code review wizard. |

## What problems does Mission Control solve?

| Problem | Tutorial |
| --- | --- |
| Skills from public sources introduce supply-chain and prompt-injection risk | [Protecting against insecure skills](../tutorials/protecting-against-insecure-skills.md) |
| Agent output ships without evidence or acceptance criteria | [Governing WorkOrders](../tutorials/governing-work-orders.md) |
| You can't tell whether a skill actually helps | [Improving a skill](../tutorials/improving-a-skill.md) |
| Code review doesn't scale to agent-authored PRs | [Setting up agentic code review](../tutorials/setting-up-agentic-code-review.md) |
| Repetitive operator work never becomes automation | [Automating repetitive tasks](../tutorials/automating-repetitive-tasks.md) |
| Context sprawl across repos with no lock file | [Discover and install](../registry/discover-and-install.md) |

## Why Mission Control?

- **Context as code.** Skills, rules, and manifests are versioned, reviewed, and installed like dependencies (`mc-context.json` / `mc-context.lock`).
- **Factory-first delivery.** WorkOrders replace ticket-shaped chat — every outcome has criteria, receipts, and approval state.
- **Agent-agnostic.** Registry packages and harness workflows work across Cursor, Claude, and Pi-bound runtimes.
- **Real-time operator surface.** Convex subscriptions power Command Center, Registry, and Factory Board without a separate REST layer.
- **Incremental adoption.** Seed demo data, enable one feature flag, expand outward — no big-bang migration.

## Get started

1. [Set up Mission Control](../get-started/set-up-mission-control.md) — install, Convex, demo seed.
2. [Run the demo](../get-started/run-the-demo.md) — EOS sidebar walkthrough with live counts.
3. [Improve your first skill](../get-started/improve-your-first-skill.md) — registry import → lint → eval → publish.

For the full tutorial index see [Tutorials](../tutorials/tutorials.md).
