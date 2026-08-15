import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOCAL_GOLDEN_PATH_CANDIDATE,
  renderLocalGoldenPathCandidate,
} from "./local-golden-path-candidate.mjs";

const candidatePath = fileURLToPath(
  new URL("./local-golden-path-candidate.mjs", import.meta.url),
);
const expectedOutput = `${JSON.stringify({
  schemaVersion: "local-golden-path-candidate/v1",
  outcome: "deterministic-local-candidate",
  recoveryMarker: "deterministic-recovery-v1",
  executionBoundary: "LOCAL_ONLY",
  publicationAuthority: "CONTROL_PLANE",
})}\n`;

function runCandidate() {
  return spawnSync(process.execPath, [candidatePath], {
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
    },
  });
}

test("candidate has the frozen local-only contract", () => {
  assert.equal(Object.isFrozen(LOCAL_GOLDEN_PATH_CANDIDATE), true);
  assert.equal(LOCAL_GOLDEN_PATH_CANDIDATE.recoveryMarker, "deterministic-recovery-v1");
  assert.equal(renderLocalGoldenPathCandidate(), expectedOutput);
});

test("candidate execution is deterministic and leaves its source unchanged", () => {
  const sourceBefore = readFileSync(candidatePath);
  const firstRun = runCandidate();
  const secondRun = runCandidate();
  const sourceAfter = readFileSync(candidatePath);

  for (const result of [firstRun, secondRun]) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, expectedOutput);
  }

  assert.deepEqual(sourceAfter, sourceBefore);
});
