/**
 * The standalone workflow executor was retired in Runtime Contract v33.
 *
 * Factory execution is owned by mission-control-orchestration and its signed,
 * leased service-command boundary. Keeping this package as an explicit
 * tombstone prevents old deployment automation from silently starting a
 * process that can no longer authenticate its Convex callbacks.
 */

console.error(
  "The standalone workflow executor is retired. Start mission-control-orchestration instead.",
);
process.exitCode = 1;
