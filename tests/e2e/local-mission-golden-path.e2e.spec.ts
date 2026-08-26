import { expect, test, type Page } from "@playwright/test";

const appUrl = process.env.MISSION_CONTROL_URL ?? "";
const workspaceId = process.env.MISSION_GOLDEN_PATH_WORKSPACE_ID ?? "";
const missionId = process.env.MISSION_GOLDEN_PATH_MISSION_ID ?? "";
const missionTitle = process.env.MISSION_GOLDEN_PATH_MISSION_TITLE ?? "Local Mission-to-PR V1 golden path";
const factoryVersionLabel = process.env.MISSION_GOLDEN_PATH_FACTORY_VERSION_LABEL ?? "feature-dev";
const workOrderId = process.env.MISSION_GOLDEN_PATH_WORK_ORDER_ID ?? "";
const attemptId = process.env.MISSION_GOLDEN_PATH_ATTEMPT_ID ?? "";
const verificationAttemptId = process.env.MISSION_GOLDEN_PATH_VERIFICATION_ATTEMPT_ID ?? "";
const verificationSubjectDigest = process.env.MISSION_GOLDEN_PATH_VERIFICATION_SUBJECT_DIGEST ?? "";
const verificationPlanId = process.env.MISSION_GOLDEN_PATH_VERIFICATION_PLAN_ID ?? "";
const failedAttemptId = process.env.MISSION_GOLDEN_PATH_FAILED_ATTEMPT_ID ?? "";
const candidateSha = process.env.MISSION_GOLDEN_PATH_CANDIDATE_SHA ?? "";
const previousCandidateSha = process.env.MISSION_GOLDEN_PATH_PREVIOUS_CANDIDATE_SHA ?? "";
const productPullRequestNumber = process.env.MISSION_GOLDEN_PATH_PRODUCT_PR ?? "";
const deterministicFixture = process.env.MISSION_GOLDEN_PATH_CI_FIXTURE === "1";
const liveProofConfigured = Boolean(
  appUrl
  && workspaceId
  && missionId
  && missionTitle
  && factoryVersionLabel
  && workOrderId
  && attemptId
  && verificationAttemptId
  && verificationSubjectDigest
  && verificationPlanId
  && failedAttemptId
  && candidateSha
  && previousCandidateSha
  && productPullRequestNumber
);

function watchPage(page: Page) {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText;
    if (failure !== "net::ERR_ABORTED" && !request.url().includes("/gateway/status")) {
      failedRequests.push(`${request.method()} ${request.url()} :: ${failure}`);
    }
  });
  return { pageErrors, failedRequests };
}

test("local Mission golden path exposes exact eligible candidate and recovery lineage after refresh", async ({ page }) => {
  test.skip(!liveProofConfigured, "Set the live local golden-path IDs to run the real-backend browser proof.");
  const capture = watchPage(page);

  await page.goto(`${appUrl}/v2/missions/${missionId}?workspace=${workspaceId}`);
  await expect(page.getByRole("heading", { name: missionTitle, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Execution", exact: true }).click();
  await expect(page.getByText(attemptId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(verificationAttemptId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(candidateSha, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(verificationSubjectDigest, { exact: true })).toBeVisible();
  await expect(page.getByText(verificationPlanId, { exact: true })).toBeVisible();
  await expect(page.getByText("Server-derived independence passed", { exact: true })).toBeVisible();
  await expect(page.getByText(deterministicFixture ? "4 envelope(s)" : "3 envelope(s)", { exact: false })).toBeVisible();
  await expect(page.getByText(`#${productPullRequestNumber} · installation 152563527`, { exact: true })).toBeVisible();
  await expect(page.getByText("ELIGIBLE", { exact: true })).toBeVisible();
  await expect(page.getByText(/ELIGIBLE · non-authoritative projection/)).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Execution", exact: true }).click();
  await expect(page.getByText(candidateSha, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(verificationAttemptId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("ELIGIBLE", { exact: true })).toBeVisible();

  await page.goto(`${appUrl}/v2/control-work-orders?project=sf-demo&workspace=${workspaceId}&workOrder=${workOrderId}`);
  await expect(page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();
  if (!deterministicFixture) {
    await expect(page.getByText(factoryVersionLabel, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByText(
    deterministicFixture ? "pnpm test" : "node --test scripts/local-golden-path-candidate.test.mjs",
    { exact: true },
  ).first()).toBeVisible();
  await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Exact-head CI and every criterion have accepted evidence. Human merge review can proceed.", { exact: true })).toBeVisible();
  await expect(page.getByText(candidateSha, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PR OPEN", { exact: true })).toBeVisible();
  await expect(page.getByText(attemptId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(failedAttemptId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(new RegExp(previousCandidateSha)).first()).toBeVisible();
  await expect(page.getByText("Ready for explicit acceptance.", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept WorkOrder", exact: true })).toBeEnabled();

  if (deterministicFixture) {
    await expect(page.getByText("Implement the approved Mission candidate", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1 of 1 Tasks complete", { exact: true })).toBeVisible();
    await expect(page.getByText("2 of 2 criteria verified", { exact: true })).toBeVisible();
  }

  expect(capture.pageErrors).toEqual([]);
  expect(capture.failedRequests).toEqual([]);
});
