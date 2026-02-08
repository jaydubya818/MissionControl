# Mission Control Roadmap

Last updated: 2026-02-08

## Now (0–2 weeks)

- Harden operator-critical workflows:
  - approvals center throughput and reason quality
  - task drawer explainability and simulation UX
  - agent registry controls + confirmation semantics
- Enforce docs/contract consistency:
  - keep backend response contracts aligned with UI usage
  - close remaining stale field references in legacy views
- Stabilize release quality gates:
  - run `ci:typecheck` and `ci:test` on every PR
  - keep architecture/plan docs in sync with shipped behavior

## Next (2–6 weeks)

- Security + tenancy hardening:
  - mandatory project scoping for list/search surfaces
  - role-based authz checks on sensitive mutations
- Performance hardening:
  - replace `.collect()` + in-memory filtering with index-driven queries in hot paths
  - reduce timeline/report N+1 joins with pre-joined view helpers
- Event contract unification:
  - standardize timeline event schema across transitions/activities/runs/tool calls
  - add stable event IDs and rule IDs for policy causality

## Later (6+ weeks)

- Executor maturity:
  - complete multi-executor routing with rollout flags and safe defaults
  - remove partial/stub execution paths
- Evaluation harness:
  - offline policy/routing benchmark suite with regression baselines
  - decision-quality scoring for assignment and approvals
- Reporting + compliance:
  - export-grade incident reports and audit bundles
  - retention and archival policy for high-volume telemetry
