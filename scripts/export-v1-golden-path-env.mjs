#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const resultPath = process.argv[2];
if (!resultPath) {
  throw new Error("Usage: node scripts/export-v1-golden-path-env.mjs <convex-seed-result.json>");
}

const result = JSON.parse(await readFile(resultPath, "utf8"));
const entries = {
  MISSION_GOLDEN_PATH_CI_FIXTURE: "1",
  MISSION_GOLDEN_PATH_WORKSPACE_ID: result.projectId,
  MISSION_GOLDEN_PATH_MISSION_ID: result.missionId,
  MISSION_GOLDEN_PATH_MISSION_TITLE: "Spec Intake Golden Path — immutable revision proof",
  MISSION_GOLDEN_PATH_WORK_ORDER_ID: result.workOrderId,
  MISSION_GOLDEN_PATH_ATTEMPT_ID: result.sourceAttemptRunId,
  MISSION_GOLDEN_PATH_VERIFICATION_ATTEMPT_ID: result.verificationAttemptRunId,
  MISSION_GOLDEN_PATH_VERIFICATION_SUBJECT_DIGEST: result.verificationSubjectDigest,
  MISSION_GOLDEN_PATH_VERIFICATION_PLAN_ID: result.verificationPlanId,
  MISSION_GOLDEN_PATH_FAILED_ATTEMPT_ID: result.failedAttemptRunId,
  MISSION_GOLDEN_PATH_CANDIDATE_SHA: result.candidateSha,
  MISSION_GOLDEN_PATH_PREVIOUS_CANDIDATE_SHA: result.previousCandidateSha,
  MISSION_GOLDEN_PATH_PRODUCT_PR: result.productPullRequestNumber,
};

for (const [name, value] of Object.entries(entries)) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).includes("\n")) {
    throw new Error(`Convex qualification seed omitted or invalidated ${name}.`);
  }
  process.stdout.write(`${name}=${value}\n`);
}
