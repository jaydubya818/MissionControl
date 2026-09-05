import { defineConfig } from "vitest/config";
import orchestration from "./apps/orchestration-server/vitest.config";

// Offline qualification only. The listed tests use synthetic credentials and
// controlled transport fixtures; no server entrypoint or dotenv loader is imported.
export default defineConfig({
  resolve: orchestration.resolve,
  test: {
    environment: "node", testTimeout: 60_000,
    include: [
      ...["fabExecutorAdapter", "harnessAdapterRegistry", "factoryAttemptWorker", "factoryAttemptWorkerRemote", "factoryVerification", "factoryVerificationAuthority", "factoryGitRuntime", "factoryPathScope", "sandboxCredentials", "sandboxReconciler", "githubAppPublisher", "auth"].map(name => `apps/orchestration-server/src/__tests__/${name}.test.ts`),
      ...["executionRecovery", "verificationPersistence", "factoryRuntimeGoldenPath", "factoryWorkerRuntime", "factoryHumanReview", "workOrderGovernance", "serviceCommandAuth"].map(name => `convex/__tests__/${name}.test.ts`),
      ...["verificationCurrentness", "verificationIndependence", "verificationAuthority"].map(name => `packages/workflow-engine/src/__tests__/${name}.test.ts`),
    ],
  },
});
