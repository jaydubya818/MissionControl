#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_GOLDEN_PATH_CANDIDATE = Object.freeze({
  schemaVersion: "local-golden-path-candidate/v1",
  policyVersion: "verification-contract/v2",
  outcome: "deterministic-local-candidate",
  executionBoundary: "LOCAL_ONLY",
  publicationAuthority: "CONTROL_PLANE",
});

export function renderLocalGoldenPathCandidate() {
  return `${JSON.stringify(LOCAL_GOLDEN_PATH_CANDIDATE)}\n`;
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  process.stdout.write(renderLocalGoldenPathCandidate());
}
