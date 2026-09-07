# Incident Command Production Dispatch Admission Proof — v55

## Problem

The production incident-control chain can pause and independently observe the
repository projection, but production acceptance cannot safely exercise the
actual dispatch admission boundary when every retained WorkOrder is already
terminal or has an active run and the workspace has no qualified Execution
Profile for creating a new WorkOrder.

## Bounded change

- Add one authenticated, exact-incident/exact-repository admission-attempt
  mutation that calls the same `requireRepositoryDispatchAdmission` gate used
  by WorkOrder dispatch.
- Permit only a fail-closed `repository-dispatch-paused` result. Persist that
  result as an append-only `DISPATCH_DENIED` control receipt; create no Attempt,
  workflow run, worker request, or external call.
- Expose one operator button and a distinct persisted denial stage in Incident
  Command. Reuse the denial receipt as canonical Measure evidence.
- Advance the public runtime contract from v54 to v55 and add focused runtime,
  UI, schema/currentness, and refresh coverage.

## Acceptance

1. The admission attempt is scoped to the authenticated incident commander,
   incident, project, and repository.
2. It invokes the production dispatch gate and succeeds only when that gate
   denies with `repository-dispatch-paused`.
3. The durable receipt is idempotent, runtime-contract-versioned, and linked to the
   independently observed PAUSE effect.
4. No run, Attempt, worker launch, external mutation, or unrelated repository
   state is created or changed.
5. Incident Command shows the denial after refresh and can use it as canonical
   evidence for the Measure transition.
