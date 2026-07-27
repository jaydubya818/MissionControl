# Platform components

Mission Control maps Tessl-style agentic development primitives onto a Convex-backed control plane.

## Registry & package manager

- **Tables:** `contextPackages`, `contextPackageVersions`, `contextInstallations`, `contextManifests`, `contextLocks`
- **UI:** Registry Discover, Skill Inventory, Installations, Context CDL
- **CLI:** `mc context import`, `mc context lock`, skill lint scripts

Packages use slugs like `mission-control/factory-health`. Published versions carry content hashes, quality scores, and security status.

## Governance

- **Tables:** `policyEnvelopes`, `agentIdentities`, `deployments`, `approvals`, `qcRulesets`, `qcRuns`
- **UI:** Policies, Identities, Deployments, Approvals & Audit, QC Rulesets
- **Engine:** `@mission-control/policy-engine` (GREEN / YELLOW / RED)

Every risky tool call can require human approval. Deployments and identity validation gate agent runtime envelopes.

## Evals

- **Tables:** `contextEvalScenarios`, `contextEvalRuns`, `contextVerifiers`
- **UI:** Evaluate Skill, Eval Runs, Registry eval tab
- **Gate:** `eval.framework` feature flag blocks publish without passing scenarios

Eval runs compare baseline vs candidate scores per scenario. Meta-loop suggestions propose new verifiers and scenarios from production failures.

## Software factory

- **Tables:** `workOrders`, `workOrderRevisions`, `workflowRuns`, `verificationReceipts`
- **UI:** Work Orders, Factory Board, Execution, Pipelines
- **Runtime:** Hermes (operator) + Pi (bounded execution) with receipt ingestion

WorkOrders own acceptance criteria, approval status, and verification state. Execution runs link artifacts and criterion-level evidence.

## Observability

- **Tables:** `runs`, `toolCalls`, `opEvents`, `alerts`, `activities`, `costEvents`
- **UI:** Command Center, Incidents (telemetry), Cost, Trace Inspector
- **Metrics:** Factory Health KPIs — human touches, token spend, shared component contributions

Exception-first surfaces: blocked WorkOrders, open approvals, failed verification, and incident streams.

## Harness engineering

- **Tables:** `harnessPrChecks`, `metaLoopSuggestions`, `contextWorkflowRuns`, `changeRiskPolicies`
- **UI:** Harness group — AI Patterns, Architect Mode, Software Factory, Workshop, Automations, Agent Fleet
- **Flows:** Seven-step code review wizard, merge gate commentary, mutation testing on PR diffs

Harness connects conference patterns (Paul Stack, Patrick Debois, Eric's workshop, IndyDevDan ADW) to live Convex data.
