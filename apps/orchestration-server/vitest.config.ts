import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../..");

export default defineConfig({
  root: "apps/orchestration-server",
  resolve: {
    alias: {
      "@mission-control/coordinator": path.resolve(repoRoot, "packages/coordinator/src/index.ts"),
      "@mission-control/agent-runtime": path.resolve(repoRoot, "packages/agent-runtime/src/index.ts"),
      "@mission-control/memory": path.resolve(repoRoot, "packages/memory/src/index.ts"),
      "@mission-control/context-router": path.resolve(repoRoot, "packages/context-router/src/index.ts"),
      "@mission-control/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
