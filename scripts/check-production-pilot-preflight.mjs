#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateProductionPilotPreflight } from "./lib/production-pilot-preflight.mjs";

const manifestPath = process.argv.slice(2).find((argument) => argument !== "--");
if (!manifestPath) {
  console.error("Usage: pnpm run pilot:preflight -- /absolute/path/to/production-pilot.json");
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    console.error(`FAIL production pilot preflight: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
  if (manifest) {
    const result = evaluateProductionPilotPreflight(manifest);
    if (!result.ok) {
      console.error(`BLOCKED production pilot preflight: ${result.findings.length} finding(s)`);
      for (const finding of result.findings) console.error(`- ${finding}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS production pilot preflight: ${absolutePath}`);
    }
  }
}
