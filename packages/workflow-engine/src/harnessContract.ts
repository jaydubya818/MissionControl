/**
 * Browser- and Convex-safe public surface for harness admission contracts.
 *
 * Keep this entry point free of runtime exports that depend on Node.js. Local
 * executor implementations remain available from the package root.
 */
export * from "./executorAdapter.js";
export * from "./harnessManifests.js";

export * from "./isolatedInvocation.js";
export * from "./deterministicWorkload.js";
export * from "./deterministicVerification.js";
export { validateChangedFileScope } from "./repositoryScope.js";
