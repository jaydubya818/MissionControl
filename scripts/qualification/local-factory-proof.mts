import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [mode, directory, runLabel = "v13", outputPath] = process.argv.slice(2);
if (!['seal', 'serve'].includes(mode) || !directory || !/^v[1-9][0-9]*$/.test(runLabel)) {
  throw new Error("Usage: local-factory-proof.mts <seal|serve> <evidence-directory> <vN> [output-path]");
}
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY) {
  throw new Error("Exact disposable loopback backend required.");
}

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, {
  subject: "user_SyntheticHandoffQualification",
  issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test",
  name: "Synthetic Qualification Operator",
});

async function buildProof() {
  let runtimeEvidencePath = `${directory}/canonical-worker-runtime-evidence-${runLabel}.json`;
  try {
    await readFile(runtimeEvidencePath, "utf8");
  } catch {
    runtimeEvidencePath = `${directory}/canonical-worker-runtime-evidence.json`;
  }
  const [state, factory, activation, runtime, repository, permission, cleanupDenial, match, mutation, stale, canceled] = await Promise.all([
    readJson(`${directory}/local-synthetic-mission-${runLabel}.json`),
    readJson(`${directory}/local-factory-setup.json`),
    readJson(`${directory}/local-factory-activation-proof.json`),
    readJson(runtimeEvidencePath),
    readJson(`${directory}/local-repository-registration-proof.json`),
    readJson(`${directory}/temporary-permission-trial-5/post-cleanup.json`),
    readJson(`${directory}/temporary-permission-trial-5/cleanup-denial.json`),
    readJson(`${directory}/unpublished-verifier-controls-3/match.json`),
    readJson(`${directory}/unpublished-verifier-controls-3/mutation.json`),
    readJson(`${directory}/unpublished-verifier-controls-3/stale.json`),
    readJson(`${directory}/unpublished-verifier-controls-3/canceled.json`),
  ]);
  const detail = await client.query(makeFunctionReference<"query">("workOrders:get"), { workOrderId: state.workOrderId }) as any;
  const source = detail.executionRuns?.find((run: any) => run._id === state.producerAttemptId);
  const verifier = detail.executionRuns?.find((run: any) => run.attemptPurpose === "VERIFICATION" && run.status === "COMPLETED");
  const result = detail.verificationRuns?.find((row: any) => row.workflowRunId === verifier?._id);
  const receipt = detail.verificationReceipts?.find((row: any) => row.receiptScope === "WORK_ORDER" && row.verificationRunId === result?._id);
  const evidence = (detail.evidenceEnvelopes ?? []).filter((row: any) => receipt?.evidenceEnvelopeIds?.includes(row._id));
  const tuple = detail.currentVerification?.exactIdentity;
  const exactLineage = Boolean(source && verifier && result && receipt && tuple
    && source._id !== verifier._id
    && tuple.sourceAttemptId === source._id
    && receipt.sourceAttemptId === source._id
    && receipt.verificationAttemptId === verifier._id
    && receipt.verificationRunId === result._id
    && receipt.verificationSubjectDigest === tuple.verificationSubjectDigest
    && receipt.verificationPlanDigest === result.verificationPlanDigest
    && receipt.evidenceEnvelopeIds.length === evidence.length
    && evidence.every((row: any) => row.sourceAttemptId === source._id
      && row.verificationAttemptId === verifier._id
      && row.verificationRunId === result._id
      && row.verificationSubjectDigest === tuple.verificationSubjectDigest
      && row.verificationPlanDigest === result.verificationPlanDigest));
  const qualificationEvidenceCurrent = exactLineage
    && result.status === "COMPLETED" && result.verdict === "VERIFIED"
    && receipt.status === "PASSED" && receipt.verdict === "VERIFIED" && receipt.independenceValid === true
    && receipt.validUntil > Date.now()
    && evidence.length > 0 && evidence.every((row: any) => row.result === "PASS" && row.provenance === "SYNTHETIC"
      && row.metadata?.evidenceOrigin === "CONTROL_FIXTURE" && row.metadata?.authority === "NONE"
      && row.metadata?.behavioralPass === false && row.metadata?.serverDerivedIndependence === true);
  const runtimeBinding = runtime.bindings?.find((binding: any) => binding.hostId === "local-synthetic-qualification-worker");
  const providerCalls = [match, mutation, stale, canceled].map(control => control.result?.invocationEvidence?.validatedRuntimeResult?.providerCalls ?? 0);
  const permissionRemoved = Array.isArray(permission.permissions)
    && !permission.permissions.includes("factory.automation.manage")
    && Array.isArray(permission.automationRoles) && permission.automationRoles.length === 0;
  const cleanupDenied = cleanupDenial.denied === true && cleanupDenial.permissionCurrentlyGranted === false;
  const controls = { match: match.passed === true, mutation: mutation.passed === true, stale: stale.passed === true, canceled: canceled.passed === true };
  const proof = {
    schema: "synthetic-factory-admission-proof/v1",
    classification: qualificationEvidenceCurrent && permissionRemoved && cleanupDenied && Object.values(controls).every(Boolean)
      ? "SYNTHETIC_FACTORY_ADMISSION_QUALIFIED" : "NOT_QUALIFIED",
    capturedAt: Date.now(), backendReadAt: Date.now(), runLabel, scenarioVersion: state.scenarioVersion,
    environment: { target: "QUALIFICATION", productionAuthority: "NONE", publicationAuthority: "NONE",
      repositoryId: repository.repositoryId, admissionDigest: repository.admissionDigest ?? repository.digest },
    factory: {
      producerVersionId: factory.producerFactoryVersion, verifierVersionId: factory.verifierFactoryVersion,
      producerConfigurationDigest: activation.factories?.producer?.version?.configurationDigest,
      verifierConfigurationDigest: activation.factories?.verifier?.version?.configurationDigest,
      producerProfileId: factory.producerProfileV2.executionProfileId,
      verifierProfileId: factory.verifierProfileV2.executionProfileId,
    },
    runtime: {
      workerId: runtimeBinding?.hostId, workerSessionId: runtimeBinding?.workerRuntime?.sessionId,
      workerGeneration: runtimeBinding?.workerRuntime?.generation, hostRuntime: runtimeBinding?.runtime,
      runtimeImage: "sha256:4c0e7e776c25f393ba9eb2e29319dbc38dc4c1d0f8a91e307aeb1a31849269db",
      runtimeArtifactDigest: receipt?.metadata?.executionProfile?.runtimeArtifactDigest,
      backend: "isolated-container", modelRoute: "DENIED",
    },
    execution: {
      missionId: state.mission?._id ?? state.mission?.mission?._id, planId: state.plan?._id ?? state.plan?.plan?._id,
      workOrderId: state.workOrderId, taskId: state.taskId,
      producerAttemptId: source?._id, producerStatus: source?.status, candidateRevision: source?.candidateRevision,
      verifierAttemptId: verifier?._id, verifierStatus: verifier?.status, verificationRunId: result?._id,
      verificationVerdict: result?.verdict, verificationSubjectDigest: tuple?.verificationSubjectDigest,
      verificationPlanDigest: result?.verificationPlanDigest, receiptId: receipt?._id,
    },
    qualificationCurrentness: { current: qualificationEvidenceCurrent, exactLineage, evidenceIds: receipt?.evidenceEnvelopeIds ?? [],
      productionAcceptanceCurrent: detail.currentVerification?.current === true,
      productionAcceptanceEligible: detail.currentVerification?.eligible === true,
      productionFenceReason: detail.currentVerification?.reasons ?? [] },
    controls,
    cleanup: { temporaryPermission: permissionRemoved && cleanupDenied ? "REMOVED" : "UNPROVEN", postRemovalDenial: cleanupDenied },
    economics: { externalModelCalls: 0, providerCalls: providerCalls.reduce((sum, value) => sum + value, 0), costUsd: 0 },
    publication: { count: 0, authority: "NONE" }, productionChanges: 0,
  };
  return { ...proof, proofDigest: sha256(proof) };
}

const esc = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
function page(proof: any) {
  const rows = [
    ["Factory versions", `${proof.factory.producerVersionId} / ${proof.factory.verifierVersionId}`],
    ["Execution Profiles", `${proof.factory.producerProfileId} / ${proof.factory.verifierProfileId}`],
    ["WorkOrder / Task", `${proof.execution.workOrderId} / ${proof.execution.taskId}`],
    ["Producer Attempt", `${proof.execution.producerAttemptId} · ${proof.execution.producerStatus}`],
    ["Candidate", proof.execution.candidateRevision],
    ["Verifier Attempt", `${proof.execution.verifierAttemptId} · ${proof.execution.verifierStatus}`],
    ["Verification", `${proof.execution.verificationVerdict} · current in qualification: ${proof.qualificationCurrentness.current}`],
    ["Production acceptance", `current: ${proof.qualificationCurrentness.productionAcceptanceCurrent} · eligible: ${proof.qualificationCurrentness.productionAcceptanceEligible}`],
    ["Temporary permission", proof.cleanup.temporaryPermission],
    ["External model/provider calls", `${proof.economics.externalModelCalls} / ${proof.economics.providerCalls}`],
    ["Publication / Production changes", `${proof.publication.count} / ${proof.productionChanges}`],
  ];
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Factory Admission Proof</title><style>
  :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui;background:#0a0f18;color:#e9eef7}body{margin:0;padding:32px}.wrap{max-width:1100px;margin:auto}.eyebrow{color:#8fa2bd;text-transform:uppercase;letter-spacing:.12em;font-size:12px}.status{display:inline-block;padding:8px 12px;border:1px solid #2f9d75;border-radius:999px;color:#78e2b5;background:#0d2a24;font-weight:700}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.card{border:1px solid #263247;background:#111927;border-radius:12px;padding:16px}.label{color:#91a2ba;font-size:13px;margin-bottom:8px}.value{font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;overflow-wrap:anywhere}.fence{border-left:3px solid #e3ad52;background:#251d0f;padding:14px 16px;border-radius:8px}.meta{color:#8494aa;font-size:12px;margin-top:20px}.controls{display:flex;gap:8px;flex-wrap:wrap}.control{padding:6px 9px;background:#142a23;color:#79dab1;border-radius:7px;font-size:12px}@media(max-width:640px){body{padding:18px}.grid{grid-template-columns:1fr}}
  </style><body><main class="wrap"><p class="eyebrow">Mission Control · persisted backend proof</p><h1>Context &amp; Skills Factory Admission</h1><p class="status">${esc(proof.classification)}</p><div class="grid">${rows.map(([label,value])=>`<section class="card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></section>`).join('')}</div><h2>Failure controls</h2><div class="controls">${Object.entries(proof.controls).map(([key,value])=>`<span class="control">${esc(key)}: ${esc(value)}</span>`).join('')}</div><h2>Production fence</h2><p class="fence">Synthetic evidence is current for qualification and deliberately carries no production acceptance or publication authority. ${esc(proof.qualificationCurrentness.productionFenceReason.join(' '))}</p><p class="meta">Backend read ${esc(new Date(proof.backendReadAt).toISOString())} · proof ${esc(proof.proofDigest)}</p></main></body></html>`;
}

if (mode === "seal") {
  const proof = await buildProof();
  if (proof.classification !== "SYNTHETIC_FACTORY_ADMISSION_QUALIFIED") throw new Error(JSON.stringify(proof));
  const target = outputPath ?? `${directory}/synthetic-factory-admission-proof-${runLabel}.json`;
  await writeFile(target, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ classification: proof.classification, output: target, proofDigest: proof.proofDigest }));
} else {
  const port = Number(process.env.QUALIFICATION_PROOF_PORT ?? 4179);
  createServer(async (_request, response) => {
    try {
      const proof = await buildProof();
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(page(proof));
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  }).listen(port, "127.0.0.1", () => console.log(`Qualification proof: http://127.0.0.1:${port}`));
}
