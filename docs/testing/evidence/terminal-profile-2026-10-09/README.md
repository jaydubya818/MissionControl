# Terminal reporting and explicit local profile

Scope: fix diagnostic status, preserve terminal precedence, add explicit local
Research Lab large-profile selection, rerun full-tree offline qualification,
and prepare current pricing evidence and a bounded live-run proposal. No paid
inference, budget release or broader deployment is authorized.

Success diagnostics do not accept a WorkOrder or bypass the existing frozen
result validation. The larger profile requires the previously tested immutable
image, explicit configuration, and loopback Research Lab backend on port 3214.

## Results

Implementation commit `093cc1d`. The previous unconditional WORKLOAD_FAILURE
assignment is replaced with diagnostic classification of the captured bundle.
Terminal controls take precedence. Complete authoritative result validation
remains in RemoteSandboxRuntime. The changes cover the provider, two focused
helpers, explicit composition and identity, and their tests/fixture. No UI,
Convex mutation or shared deployment changed.

- Full repository on the real explicit local profile: one test passed in
  24.93 seconds, with SUCCESS diagnostics, COMPLETED result, exactly one changed
  file and two synthetic exchanges. Zero paid provider calls. No test-only
  provider substitution was used for this run. Cleanup receipt confirms absence.
- Seven actual Docker worker lifecycle cases passed using the standard offline
  candidate image: failure result, cancellation, timeout, startup failure, budget
  denial, cleanup failure and worker process death. These do not prove all
  lifecycle scenarios under the larger image.
- Focused reporting, selection, containment, admission, bridge and liability
  checks: 104 passed, two existing opt-in cases skipped.
- Full orchestration suite: 797 passed, 12 skipped. The archived full-tree opt-in
  test was one of those skipped cases and was run separately above.
- Orchestration TypeScript check passed with no diagnostics.

The temporary full-tree test and candidate setup were removed after archiving.
Historical failing evidence is unchanged. The producer worker was not started.
No profile, price or reservation was registered in Research Lab.

## Remaining gates

See the [local profile operations and price review](../../../operations/research-lab-large-profile.md)
for exact selection fields and the draft four-request $13.48 producer budget.
`live-run-proposal.json` is explicitly DRAFT_NOT_AUTHORIZED. It is not a valid
approved ProviderPrice or spend authority. Exact-route pricing/capability
qualification and canonical local admission remain unresolved; the standard
canonical Docker gate intentionally still rejects the new profile key.
Do not use the synthetic profile factory to fabricate live admission records.

The saved price approval was not extended. The old $4.49 remains reserved.
Fresh budget and activation approval are required after those gates are met.
Full Mission qualification, independent verification and broader deployment
remain incomplete and unapproved.
