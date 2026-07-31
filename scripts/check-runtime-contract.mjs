#!/usr/bin/env node

import { runRuntimeContractGuard } from "./lib/runtime-contract-guard.mjs";

function readBaseArg(argv) {
  const index = argv.indexOf("--base");
  if (index === -1) return process.env.RUNTIME_CONTRACT_BASE_SHA;
  if (!argv[index + 1]) throw new Error("--base requires a Git revision");
  return argv[index + 1];
}

try {
  const result = runRuntimeContractGuard({ baseRef: readBaseArg(process.argv.slice(2)) });
  const label = result.ok ? "PASS" : "FAIL";
  console.log(`Runtime contract guard: ${label}`);
  console.log(result.message);
  if (result.changes.length > 0) {
    for (const change of result.changes) {
      console.log(`- ${change.name}: ${change.reason}`);
    }
  }
  if (!result.ok) {
    console.error(
      "Increment RUNTIME_CONTRACT_VERSION in convex/lib/runtimeContract.ts and ship the client/backend contract atomically.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Runtime contract guard: ERROR");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
