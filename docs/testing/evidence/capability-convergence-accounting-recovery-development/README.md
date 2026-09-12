# Accounting recovery — development and approval evidence

This directory preserves the preapproval development checkpoint and its exact
review artifacts. Independent red/green reproductions verify the corrected
shutdown, ancestor, bounded temporary-file and FIFO defects. The original JSON
records and patches are historical and remain bound to their recorded source
hashes; their `AWAITING` and `unapplied` fields describe that earlier checkpoint.

The Product Owner subsequently approved the exact settlement-only typed error
wrappers and decoder, independent startup wiring, and acknowledgment diagnostic
label correction. They are applied and their focused green checkpoint is recorded
in [Applied source checkpoint](applied-source-checkpoint.md). No provider call,
listening service, or Production change occurred in that checkpoint.

The parent observation slice is merged and clean-main qualified at `44f240c`;
[its retained proof](../capability-convergence-observations-postmerge/README.md)
passes 19 gates, 2958 tests and 15 browser checks. The recovery worktree still
needs parent integration, full qualification, CI, merge, clean-main proof, and
release. Signed local backend proof is retained in the final recovery evidence
rather than claimed by this development checkpoint. Todo 063 and program
acceptance remain in progress.
