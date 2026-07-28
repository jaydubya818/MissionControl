import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { describe, expect, it } from "vitest";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
// Keep the live integration fixture out of the operator's real repository
// scope. The slug is stable for one test process so cleanup can restore it.
const REPO_SLUG = process.env.GOVERNED_CONTEXT_TEST_REPO_SLUG
  ?? `software-factory-research-lab/governed-context-e2e-${process.pid}`;
const PACKAGE_SLUG = "software-factory/workspace-handoff-checklist";
const EXPECTED_VERSION = "0.1.0";
const EXPECTED_HASH = "sha256:224d9f437b2dee846b79177167b2f203b5f9081b5d6641d62062182f85d8e12c";
const WORKTREE_PATH = process.env.GOVERNED_CONTEXT_TEST_WORKTREE
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const FIXTURE_ID = `pi-governed-context-bridge-e2e:${Date.now()}`;
const WORKFLOW_ID = "pi-governed-context-bridge-e2e";
const EVIDENCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tmp/governed-context-bridge-e2e-evidence.json"
);

type InstallationRow = {
  packageSlug: string;
  version: string;
  contentHash: string;
  state: string;
};

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizeInstallations(rows: InstallationRow[]) {
  return [...rows]
    .map((row) => ({
      packageSlug: row.packageSlug,
      version: row.version,
      contentHash: row.contentHash,
      state: row.state,
    }))
    .sort((a, b) => a.packageSlug.localeCompare(b.packageSlug));
}

describe("governed context bridge integration", () => {
  it("dispatches governed context and enforces activation receipts end to end", async () => {
    process.env.CONVEX_URL = CONVEX_URL;
    process.env.ORCHESTRATION_DISABLE_STARTUP = "1";
    process.env.PROJECT_SLUG = "software-factory-research-lab";

    const client = new ConvexHttpClient(CONVEX_URL);
    const convex = client as any;
    const { app } = await import("../index.js");

    const packageRow = await convex.query("context/packages:getBySlug", { slug: PACKAGE_SLUG }) as any;
    expect(packageRow?._id).toBeTruthy();

    const detail = await convex.query("context/packages:getDetail", { packageId: packageRow._id }) as any;
    expect(detail?.version?.version).toBe(EXPECTED_VERSION);
    expect(detail?.version?.status).toBe("PUBLISHED");
    expect(detail?.version?.contentHash).toBe(EXPECTED_HASH);
    expect(typeof detail?.version?.inlineContent).toBe("string");

    const expectedContent = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../skills/workspace-handoff-checklist/SKILL.md"),
      "utf8"
    );
    expect(detail.version.inlineContent).toBe(expectedContent);

    const baselineInstallations = normalizeInstallations(
      await convex.query("context/manifests:listInstallations", { repoSlug: REPO_SLUG }) as InstallationRow[]
    );
    const baselineLock = await convex.query("context/manifests:getLock", { repoSlug: REPO_SLUG }) as any;
    const preexistingFixtureRows = baselineInstallations.filter((row) => row.packageSlug === PACKAGE_SLUG);
    expect(preexistingFixtureRows).toEqual([]);

    const fixtureLockJson = JSON.stringify({
      schemaVersion: "1.0",
      resolved: {
        [PACKAGE_SLUG]: {
          version: EXPECTED_VERSION,
          contentHash: EXPECTED_HASH,
          sourceCommitSha: detail.version.sourceCommitSha ?? "unknown",
        },
      },
    });
    const emptyLockJson = JSON.stringify({ schemaVersion: "1.0", resolved: {} });

    const fixtureEntry: InstallationRow = {
      packageSlug: PACKAGE_SLUG,
      version: EXPECTED_VERSION,
      contentHash: EXPECTED_HASH,
      state: "INSTALLED",
    };

    let cleanupInstallations: InstallationRow[] = baselineInstallations;
    let cleanupLockJson = baselineLock?.lockJson ?? emptyLockJson;
    let cleanupLockHash = baselineLock?.manifestHash ?? sha256(emptyLockJson);
    let cleanupResolvedCount = baselineLock?.resolvedCount ?? 0;

    const evidence: Record<string, unknown> = {};

    try {
      await convex.mutation("context/manifests:saveLock", {
        repoSlug: REPO_SLUG,
        lockJson: fixtureLockJson,
        manifestHash: sha256(fixtureLockJson),
        resolvedCount: 1,
        actorId: "pi-governed-context-bridge-e2e",
      });

      await convex.mutation("context/manifests:syncInstallations", {
        repoSlug: REPO_SLUG,
        entries: [...baselineInstallations, fixtureEntry],
        actorId: "pi-governed-context-bridge-e2e",
      });

      await convex.mutation("workflows:upsert", {
        workflowId: WORKFLOW_ID,
        name: "Pi governed context bridge integration",
        description: "Focused end-to-end governed context bridge fixture",
        active: true,
        agents: [{ id: "pi", persona: "Pi" }],
        steps: [{
          id: "governed-context-step",
          agent: "pi",
          input: "Use governed context",
          expects: "Receipt packet",
          retryLimit: 0,
          timeoutMinutes: 5,
        }],
        createdBy: "pi-governed-context-bridge-e2e",
      });

      const workOrderResult = await convex.mutation("workOrders:create", {
        idempotencyKey: `${FIXTURE_ID}:work-order`,
        title: "Pi · Governed context bridge fixture",
        desiredOutcome: "Exercise governed context dispatch through the orchestration bridge.",
        context: "Software Factory Research Lab integration fixture.",
        workflowId: WORKFLOW_ID,
        repository: REPO_SLUG,
        riskLevel: "LOW",
        requestedBy: "Pi",
        assignedAgent: "Pi",
        acceptanceCriteria: [
          {
            id: "ac-governed-context",
            title: "Governed context bridge succeeds",
            description: "Dispatch returns a governed context activation receipt and executor content.",
            status: "PENDING",
          },
        ],
        metadata: {
          workspace: "Software Factory Research Lab",
          sourceRepository: REPO_SLUG,
        },
      }) as any;

      const workOrderId = workOrderResult.workOrder._id;

      const dispatchResponse = await app.request(`/workorders/${workOrderId}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowId: WORKFLOW_ID,
          actorType: "SYSTEM",
          actorId: "pi-governed-context-bridge-e2e",
          idempotencyKey: `${FIXTURE_ID}:dispatch`,
          runtime: "Pi governed context integration test",
          worktree: WORKTREE_PATH,
          contextRepoSlug: REPO_SLUG,
        }),
      });
      expect(dispatchResponse.status).toBe(200);
      const dispatchBody = await dispatchResponse.json() as any;
      expect(dispatchBody.success).toBe(true);
      expect(dispatchBody.result?.run?._id).toBeTruthy();
      expect(dispatchBody.contextActivation?.receiptId).toBeTruthy();

      const workflowRunId = dispatchBody.result.run._id as string;
      const activationReceiptId = dispatchBody.contextActivation.receiptId as string;
      const activatedPackage = dispatchBody.contextActivation.packages.find(
        (pkg: any) => pkg.packageSlug === PACKAGE_SLUG
      );

      expect(activatedPackage).toBeTruthy();
      expect(activatedPackage.version).toBe(EXPECTED_VERSION);
      expect(activatedPackage.contentHash).toBe(EXPECTED_HASH);
      expect(activatedPackage.content).toBe(expectedContent);

      const persistedRun = await convex.query("workflowRuns:getById", { id: workflowRunId }) as any;
      expect(persistedRun?._id).toBe(workflowRunId);
      expect(persistedRun?.workOrderId).toBe(workOrderId);
      expect(persistedRun?.metadata?.contextActivationReceiptId).toBe(activationReceiptId);
      expect(persistedRun?.metadata?.contextRepoSlug).toBe(REPO_SLUG);

      const negativeResponse = await app.request(`/workorders/${workOrderId}/receipt-packets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowRunId,
          piSessionId: `${FIXTURE_ID}:pi-session`,
          markRunCompleted: true,
          idempotencyKey: `${FIXTURE_ID}:receipt-missing`,
          receipts: [
            {
              acceptanceCriterionId: "ac-governed-context",
              status: "PASSED",
              verificationMethod: "CHECKLIST",
              result: "Missing activation receipt should fail closed.",
            },
          ],
        }),
      });
      expect(negativeResponse.status).toBe(400);
      const negativeBody = await negativeResponse.json() as any;
      expect(negativeBody.error).toContain("Pi receipt packet must include the workflow context activation receipt");

      const positiveResponse = await app.request(`/workorders/${workOrderId}/receipt-packets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflowRunId,
          piSessionId: `${FIXTURE_ID}:pi-session`,
          markRunCompleted: true,
          idempotencyKey: `${FIXTURE_ID}:receipt-ok`,
          contextActivationReceiptId: activationReceiptId,
          receipts: [
            {
              acceptanceCriterionId: "ac-governed-context",
              status: "PASSED",
              verificationMethod: "CHECKLIST",
              result: "Matching activation receipt accepted.",
            },
          ],
        }),
      });
      expect(positiveResponse.status).toBe(200);
      const positiveBody = await positiveResponse.json() as any;
      expect(positiveBody.success).toBe(true);
      expect(positiveBody.result).toMatchObject({
        ingested: true,
        skipped: false,
        receiptCount: 1,
      });

      evidence.workflowRunId = workflowRunId;
      evidence.activationReceiptId = activationReceiptId;
      evidence.packageSlug = PACKAGE_SLUG;
      evidence.version = EXPECTED_VERSION;
      evidence.contentHash = EXPECTED_HASH;
      evidence.negativeError = negativeBody.error;
      evidence.positiveReceipt = positiveBody.result;
      evidence.baselineInstallationCount = baselineInstallations.length;
    } finally {
      await convex.mutation("context/manifests:syncInstallations", {
        repoSlug: REPO_SLUG,
        entries: cleanupInstallations,
        actorId: "pi-governed-context-bridge-e2e",
      });
      await convex.mutation("context/manifests:saveLock", {
        repoSlug: REPO_SLUG,
        lockJson: cleanupLockJson,
        manifestHash: cleanupLockHash,
        resolvedCount: cleanupResolvedCount,
        actorId: "pi-governed-context-bridge-e2e",
      });

      const afterCleanup = normalizeInstallations(
        await convex.query("context/manifests:listInstallations", { repoSlug: REPO_SLUG }) as InstallationRow[]
      );
      expect(afterCleanup).toEqual(baselineInstallations);

      mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
      writeFileSync(
        EVIDENCE_PATH,
        JSON.stringify({
          ...evidence,
          cleanupInstallationCount: afterCleanup.length,
          cleanupRestoredBaseline: true,
          cleanupLockResolvedCount: cleanupResolvedCount,
        }, null, 2)
      );
    }
  }, 60_000);
});
