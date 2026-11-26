# Factory startup readiness diagnostic

Run `pnpm run factory:readiness` in the worker's host environment. Add `--json`
for a structured result. The command uses explicit environment configuration;
it does not load repository dotenv files. It probes the existing Codex adapter
when enabled and checks pnpm through the worker's restricted executable lookup.
It prints setting names and fixed diagnostics, never credential values.

The diagnostic identifies missing service signing configuration, repository and
project scope, Factory Version bindings, incompatible execution modes, and the
unsupported Fab platform. It uses the same binding parser as worker startup.
Existing startup still owns runtime health, accounting storage initialization,
host registration, and provider qualification.

`BLOCKED` means a local prerequisite failed. `CHECKED` means the diagnostic
found no local failure. Neither result grants admission. `dispatchAdmission`
always remains `UNVERIFIED`; the command does not authenticate a control-plane
session, create a WorkOrder, start the worker, or invoke a model.

After local prerequisites pass, use the existing worker entry point,
`pnpm run worker:implementation`. Confirm its `/ready` result and a current host
heartbeat. Evaluate the actual WorkOrder in the existing readiness panel,
including its immutable Factory Version, repository, exact provider route,
budget, approval, and independent verifier. A configured environment variable
or an HTTP liveness response cannot replace that assessment.

The design compares a new readiness service with a local diagnostic over
existing startup contracts. The latter keeps admission in the control plane
and requires no new public endpoint or persisted authority record.
