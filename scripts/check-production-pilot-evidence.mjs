#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateProductionPilotEvidence } from "./lib/production-pilot-evidence.mjs";

const manifestPath = process.argv.slice(2).find((argument) => argument !== "--");
if (!manifestPath) {
  console.error("Usage: pnpm run pilot:assess -- /absolute/path/to/production-pilot.json");
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    console.error(`FAIL production pilot evidence: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
  if (manifest) {
    const result = evaluateProductionPilotEvidence(manifest);
    if (!result.ok) {
      console.error(`BLOCKED production pilot exit: ${result.findings.length} finding(s)`);
      for (const finding of result.findings) console.error(`- ${finding}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS production pilot evidence: ${absolutePath}`);
      console.log(JSON.stringify(result.summary, null, 2));
    }
  }
}
