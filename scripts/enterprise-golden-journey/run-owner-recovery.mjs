import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { validateHybrid, lock, sha256 } from "./evidence.mjs";
const output = resolve(process.argv[2]),
  build = join(output, "runtime");
const report = {
  schema: "checkpoint-h-owner-recovery/v1",
  sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  status: "NOT_RUN",
  browserGoldenJourney: "NOT_RUN",
  ownerAuthentication: "SYNTHETIC_API_FIXTURE",
  releaseGate: "ADVISORY",
  paidOperations: 0,
};
const run = (args) =>
  execFileSync(process.execPath, ["--import", "tsx", ...args], {
    stdio: "inherit",
    env: { ...process.env, MC_OWNER_REVIEW_QUALIFICATION: "1" },
  });
try {
  const recovery = JSON.parse(
    await readFile(join(build, "recovery.json"), "utf8"),
  );
  report.runtime = recovery;
  if (recovery.status === "PASS") {
    const provenance = JSON.parse(
      await readFile(join(build, "provenance.json"), "utf8"),
    );
    for (const artifact of Object.values(provenance.bundles.artifacts))
      for (const [path, digest] of Object.entries(artifact.inputs)) {
        assert.equal(
          "sha256:" +
            sha256(
              execFileSync("git", ["show", `${lock.runtimeSource}:${path}`]),
            ),
          digest,
        );
      }
    run([
      "scripts/qualification/unpublished-verifier-controls.mts",
      join(build, "bundles"),
      join(build, "image.txt"),
      join(build, "registered-controls"),
      process.env.MC_GOLDEN_DOCKER,
      join(build, "artifact/image-binding.json"),
      "3",
    ]);
    run([
      "scripts/qualification/native-successor-journey.mts",
      build,
      process.env.MC_GOLDEN_DOCKER,
      join(output, "hybrid"),
      "hybrid",
    ]);
    const journey = JSON.parse(
      await readFile(join(output, "hybrid/journey.json"), "utf8"),
    );
    report.proof = validateHybrid(
      journey,
      JSON.parse(
        await readFile(join(output, "hybrid/durable-records.json"), "utf8"),
      ),
    );
    report.ownerReview = journey.stages.linkedOwnerReview;
    assert.equal(report.ownerReview.status, "PASS");
    assert.equal(report.ownerReview.missionId, report.proof.missionId);
    process.env.MC_OWNER_REVIEW_DECISION = "REJECT";
    run([
      "scripts/qualification/native-successor-journey.mts",
      build,
      process.env.MC_GOLDEN_DOCKER,
      join(output, "rejection"),
      "hybrid",
    ]);
    const rejection = JSON.parse(
      await readFile(join(output, "rejection/journey.json"), "utf8"),
    );
    assert.equal(rejection.ownerResultRejection, "PASS");
    assert.equal(rejection.repositoryCleanup, "VERIFIED");
    assert.equal(rejection.databaseCleanup, "VERIFIED");
    assert.equal(rejection.stages.sofieDurableReadback.state, "BLOCKED");
    report.ownerRejection = rejection.stages.linkedOwnerReview;
    report.status = "PARTIAL";
    report.apiQualification = "PASS";
  } else report.reason = recovery.reason;
} catch (error) {
  report.status = "FAIL";
  report.reason = String(error.message ?? error);
}
await writeFile(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (report.status === "FAIL") process.exitCode = 1;
