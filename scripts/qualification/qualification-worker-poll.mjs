/** The qualification harness owns the worker's only poll loop; it never calls
 * worker.start(). Await attestation before the next tick can admit Git work.
 * Active attempts may finish, but no new attempt can start during this read. */
export async function pollQualificationWorker({ worker, reportHost, refreshHost, poll = true }) {
  if (refreshHost && worker.status().activeRunIds.length === 0) await reportHost();
  if (poll) await worker.tick();
}
