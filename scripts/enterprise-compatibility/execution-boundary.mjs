import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadPinnedPartner } from "./pinned-partner.mjs";
import { makeFixture } from "./fixtures.mjs";
import { mapPartnerResult } from "../../apps/orchestration-server/src/myFactoryCompatibilityAdapter.ts";

const source = process.env.MC_MYFACTORY_COMPATIBILITY_GIT;
const partner = await loadPinnedPartner(source);
const pin = "fa48a820ba185eb9b891130c78166463b61cba74";
const checks = [];
function check(name, action) { action(); checks.push(name); console.log(`PASS ${name}`); }
try {
  const f = makeFixture({}, partner);
  check("accepted V2 contract fixture remains valid", () => partner.result.validateManifest(f.manifest));
  for (const provider of ["docker", "local-docker"]) {
    check(`truthful ${provider} V2 provenance is denied by the exact pinned Result validator`, () => {
      const manifest = structuredClone(f.manifest);
      manifest.execution.configuration.cloud.provider = provider;
      manifest.execution.configurationDigest = partner.result.digest(manifest.execution.configuration);
      manifest.execution.factoryVersion = partner.result.digest({ sourceDigest: manifest.execution.sourceDigest,
        configurationDigest: manifest.execution.configurationDigest });
      assert.throws(() => partner.result.validateManifest(manifest), /Unqualified cloud provider/);
    });
  }
  const local = structuredClone(f.manifest);
  local.execution.version = 1;
  delete local.execution.inputTree;
  delete local.execution.configuration.cloud;
  delete local.verification;
  local.execution.configurationDigest = partner.result.digest(local.execution.configuration);
  local.execution.factoryVersion = partner.result.digest({ sourceDigest: local.execution.sourceDigest,
    configurationDigest: local.execution.configurationDigest });
  check("legacy V1 Result remains valid in its own contract", () => partner.result.validateManifest(local));
  check("V1 downgrade cannot satisfy the accepted MissionControl binding", () => {
    const signed = partner.result.signResult(local, f.artifactBytes, f.keyPair.privateKey);
    assert.throws(() => mapPartnerResult(signed, { ...f.binding, factoryVersion: local.execution.factoryVersion, executionProfileDigest: `sha256:${local.execution.configurationDigest}` },
      f.contract, { workOrderId: "partner-wo", runId: "partner-run" }, Date.now()), /FACTORY_COMPATIBILITY_DENIED/);
  });
  check("V1 cannot carry the pinned independent cloud verifier evidence", () => {
    assert.throws(() => partner.result.validateManifest({ ...local, verification: f.manifest.verification }),
      /Cloud verification requires a cloud candidate/);
  });
  const sourceFiles = ["packages/hosted-routing/src/result.ts", "apps/supervisor/src/producer-results.ts",
    "apps/cloud-control/src/cloud-verifier-provider.mjs", "apps/cloud-control/src/infrastructure-provider.mjs"];
  const sourceEvidence = Object.fromEntries(sourceFiles.map(path => [path, {
    gitBlob: execFileSync("git", [`--git-dir=${source}`, "rev-parse", `${pin}:${path}`], { encoding: "utf8" }).trim(),
    sha256: partner.result.sha256(execFileSync("git", [`--git-dir=${source}`, "show", `${pin}:${path}`])),
  }]));
  const baseline = JSON.parse(await readFile(new URL("../../docs/enterprise-factory/CHECKPOINT_1C_BEDROCK_BASELINE.json", import.meta.url)));
  const result = { checkpoint: "1C", status: "BLOCKED_AT_PROVIDER_PROVENANCE_BOUNDARY", acceptedMissionControlSha: baseline.sourceSha,
    myFactoryCompatibilitySha: pin, checks, sourceEvidence, baselineFailureSetSha256: baseline.failureSetSha256,
    testKind: "contract fixtures only; not an executed delegation or Factory Result",
    reason: "Pinned V2 Result requires vercel-sandbox/iad1; truthful Docker provenance is rejected. Pinned local Result is V1 and lacks required V2 source and independent-verifier bindings.",
    requiredDecision: "Independently qualify and pin a truthful local deterministic provider in the canonical MyFactory Result contract, or separately authorize bounded nonproduction Vercel sandbox execution and its credentials/cost.",
    paidOperations: 0, productionIntegration: "NOT_RUN", externalAlphaChanges: 0, executableProductionGrants: 0,
    deterministicDelegationExecution: "NOT_RUN", dependencyChanges: 0 };
  if (process.env.MC_COMPATIBILITY_EVIDENCE) await writeFile(resolve(process.env.MC_COMPATIBILITY_EVIDENCE), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally { await rm(partner.root, { recursive: true, force: true }); }
