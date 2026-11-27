# Persistent data migration checks

Use the application's real schema and deployment model. Rehearse on a
representative isolated dataset before touching live state.

1. **Expand.** Add the new representation while old code remains valid. Inspect
   engine-specific lock levels, table rewrites, index operations, defaults,
   and constraint validation. Set bounded lock waits where supported. An
   additive change still needs capacity and concurrency review.
2. **Prepare writes.** Enumerate every writer, including jobs, bulk imports,
   admin tools, and older application versions. Keep old and new forms
   consistent transactionally where possible; define how partial dual writes
   are detected and repaired. Prefer one authoritative representation.
3. **Backfill.** Use stable key ranges, bounded batches, persisted progress, and
   throttling. Make restarts safe. A backfill must not overwrite a newer value:
   use a version predicate, compare-and-set, or another conflict-safe strategy.
   Test concurrent writes and delete/recreate cases, not just a static table.
4. **Reconcile.** Check counts, constraints, nulls, mapping correctness, and
   domain totals, including exact money values when relevant. Count equality
   alone cannot prove equal content. Record and resolve discrepancies.
5. **Switch reads.** Verify new reads with representative traffic while the
   old representation remains usable for the promised rollback period.
   Shadow reads must not trigger duplicate external effects.
6. **Contract.** Wait until no supported release, worker, delayed job, or replay
   needs the old shape. Stop old writes in one release; remove the old schema
   only after incompatible writers are gone. Reconfirm explicit authority for
   destructive live operations, using existing authorization where applicable.

Recovery evidence should identify the last compatible application release,
data retained after cutover, tested restore or forward-fix procedure, and
estimated recovery time. Backups need a tested restore path. A code revert
cannot recover dropped records, and restoring a database can lose intervening
writes or repeat external effects unless those are reconciled too.
