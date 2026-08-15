# EOS navigation

Engineering OS (`eos.command-center-preview`) reorganizes the sidebar around outcomes.

## Sections

| Section | Pages |
| --- | --- |
| Overview | Command Center |
| Strategy | Missions, Objectives |
| Delivery | Work Orders, Tasks, Factory Board, Execution, Pipelines, Task Graph |
| Operations | Agents, Queue (ATC), Approvals & Audit, Incidents, Cost |
| Intelligence | AI Effectiveness, Factory Health, Environment Readiness, Friction, Recommendations, Evidence Dossiers |
| Knowledge | Registry Discover, Context CDL, Evaluate Skill, Skill Inventory, Installations, Eval Runs, Memory, Docs |
| Governance | Policies, Identities, Deployments, QC Rulesets |
| Administration | Integrations, System, Design DNA, Recorder, Test Generation, API Import |
| Labs | Flaky Steps, Gherkin Studio, Hybrid Workflows, CodeGen, Build Pipeline |

## Badge counts

Live counts from `useNavGroupsWithCounts`:

- Tasks → task count
- Execution → run count
- Incidents → alert count
- Registry / Memory → package and knowledge-graph counts

**Knowledge → Memory** is the Factory Memory entry point. Its Overview, Memory,
Graph, and Context tabs cover index health, scoped retrieval, typed graph
inspection, and immutable Attempt context snapshots respectively.

## Config

`apps/mission-control-ui/src/shellV2/eosNavConfig.ts`

Enable with `VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW=true` (set in `pnpm dev:demo`).
