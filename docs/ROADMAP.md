# Mission Control Roadmap

Last updated: 2026-02-08

## Now (0–2 weeks)

- Land and harden newly shipped control-plane upgrades:
  - approval escalation + dual-control operation quality
  - operator mode controls in day-to-day incident handling
  - canonical `taskEvents` timeline backfill coverage
  - saved view/watch workflow adoption in core task operations
- Add operator training/runbook snippets:
  - when to use `PAUSED` vs `DRAINING` vs `QUARANTINED`
  - dual-control response expectations for RED approvals

## Next (2–6 weeks)

- Security + tenancy hardening:
  - mandatory project scoping for list/search surfaces
  - role-based authz checks on sensitive mutations
- Performance hardening:
  - replace `.collect()` + in-memory filtering with index-driven queries in hot paths
  - reduce timeline/report N+1 joins with pre-joined view helpers
- Event contract unification:
  - move remaining producers to `taskEvents` (`messages`, policy decisions, tool calls)
  - add stable event IDs and rule IDs for policy causality
  - migrate exports/reports to canonical event stream only

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
