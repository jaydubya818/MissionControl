#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkFactoryDocs } from "./lib/factory-docs-consistency.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = checkFactoryDocs({ repositoryRoot });

if (!result.ok) {
  console.error(`FAIL factory documentation consistency: ${result.findings.length} finding(s)`);
  for (const finding of result.findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("PASS factory documentation consistency");
}
