import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../..");

export default defineConfig({
  root: configDir,
  resolve: {
    alias: {
      "@mission-control/coordinator": path.resolve(repoRoot, "packages/coordinator/src/index.ts"),
      "@mission-control/agent-runtime": path.resolve(repoRoot, "packages/agent-runtime/src/index.ts"),
      "@mission-control/memory": path.resolve(repoRoot, "packages/memory/src/index.ts"),
      "@mission-control/context-router": path.resolve(repoRoot, "packages/context-router/src/index.ts"),
      "@mission-control/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
      "@mission-control/workflow-engine/harness-contract": path.resolve(repoRoot, "packages/workflow-engine/src/harnessContract.ts"),
      "@mission-control/workflow-engine/verification": path.resolve(repoRoot, "packages/workflow-engine/src/verification.ts"),
      "@mission-control/workflow-engine/verification-authority": path.resolve(repoRoot, "packages/workflow-engine/src/verificationAuthority.ts"),
      "@mission-control/workflow-engine/verification-identity": path.resolve(repoRoot, "packages/workflow-engine/src/verificationIdentity.ts"),
      "@mission-control/workflow-engine/verification-currentness": path.resolve(repoRoot, "packages/workflow-engine/src/verificationCurrentness.ts"),
      "@mission-control/workflow-engine/verification-subject": path.resolve(repoRoot, "packages/workflow-engine/src/verificationSubject.ts"),
      "@mission-control/workflow-engine/verification-plan": path.resolve(repoRoot, "packages/workflow-engine/src/verificationPlan.ts"),
      "@mission-control/workflow-engine/verification-independence": path.resolve(repoRoot, "packages/workflow-engine/src/verificationIndependence.ts"),
      "@mission-control/workflow-engine/verification-decision": path.resolve(repoRoot, "packages/workflow-engine/src/verificationDecision.ts"),
      "@mission-control/workflow-engine": path.resolve(repoRoot, "packages/workflow-engine/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
