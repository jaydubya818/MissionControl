# Architect mode

Paul Stack's **architect, don't code** pattern — operators design merge gates and adoption guardrails; agents implement within envelopes.

## Live data

Architect Mode queries:

- `factory/prChecks.getMergeGateStatus` — per-PR gate verdict
- `factory/health.getAdoptionMetrics` — human touches, shared contributions, token spend

## Merge gates

Gates combine:

- CI status (PASS / FAIL / PENDING)
- Change review lens scores
- Mutation testing diff coverage
- Human-touch budget thresholds

## Adoption metrics

| Metric | Meaning |
| --- | --- |
| Human touches per agent task | Manual overrides / takeovers |
| Shared component contributions | Reuse across WorkOrders |
| Workflow token spend USD | Cost attribution for factory runs |

Use these to decide when to tighten gates vs allow agent autonomy.

Navigate: **Harness → Architect Mode**.
