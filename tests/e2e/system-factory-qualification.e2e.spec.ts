import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const APP_URL = process.env.MISSION_CONTROL_URL ?? "";
const WORKSPACE_ID = process.env.SYSTEM_FACTORY_WORKSPACE_ID ?? "";
const PR_WORKSPACE_ID = process.env.SYSTEM_FACTORY_PR_WORKSPACE_ID ?? "";
const PR_WORK_ORDER_ID = process.env.SYSTEM_FACTORY_PR_WORK_ORDER_ID ?? "";
const SEEDED_MISSION_TITLE = "Mission UI verification";
const SPEC_MISSION_TITLE = "Spec Intake Golden Path — immutable revision proof";
const QUALIFICATION_MISSION_TITLE = "System Factory Qualification V2 Browser Mission";
const EVIDENCE_DIR = path.resolve(process.env.SYSTEM_FACTORY_EVIDENCE_DIR ?? "docs/testing/evidence/system-factory-e2e-v2");
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, "screenshots");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type BrowserEvidence = {
  appUrl: string;
  workspaceId: string;
  prWorkspaceId: string;
  prWorkOrderId: string;
  missionUrl?: string;
  surfaces: string[];
  screenshots: string[];
  accessibility: Array<{
    surface: string;
    passes: number;
    incomplete: number;
    violations: Array<{ id: string; impact: string | null; nodes: number }>;
  }>;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  matrix: {
    viewports: string[];
    themes: string[];
    experienceLevels: string[];
    navigation: string[];
  };
};

function watchPage(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText;
    if (failure !== "net::ERR_ABORTED" && !request.url().includes("/gateway/status")) {
      failedRequests.push(`${request.method()} ${request.url()} :: ${failure}`);
    }
  });

  return { consoleErrors, pageErrors, failedRequests };
}

async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((nextTheme) => window.localStorage.setItem("mc.theme", nextTheme), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document, `Horizontal overflow: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectNoElementHorizontalOverflow(locator: Locator, label: string) {
  const overflow = await locator.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(overflow.scroll, `${label} overflow: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.client + 1);
}

async function captureScreenshot(
  page: Page,
  evidence: BrowserEvidence,
  name: string
) {
  const fileName = `${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, fileName) });
  evidence.screenshots.push(`screenshots/${fileName}`);
}

async function auditMain(
  page: Page,
  testInfo: TestInfo,
  evidence: BrowserEvidence,
  surface: string
) {
  const results = await new AxeBuilder({ page })
    .include("main")
    .withTags(WCAG_TAGS)
    .analyze();
  await testInfo.attach(`${surface}-axe-results`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  evidence.accessibility.push({
    surface,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    })),
  });
  expect(
    results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"),
    `${surface} has serious or critical WCAG A/AA violations`
  ).toEqual([]);
}

test("Mission Control qualifies as one progressive governed factory in the real browser", async ({ page }, testInfo) => {
  test.skip(
    !APP_URL || !WORKSPACE_ID || !PR_WORKSPACE_ID || !PR_WORK_ORDER_ID,
    "Set the real local qualification URL, demo workspace, and PR-lineage fixture IDs."
  );
  test.setTimeout(360_000);
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const capture = watchPage(page);
  const evidence: BrowserEvidence = {
    appUrl: APP_URL,
    workspaceId: WORKSPACE_ID,
    prWorkspaceId: PR_WORKSPACE_ID,
    prWorkOrderId: PR_WORK_ORDER_ID,
    surfaces: [],
    screenshots: [],
    accessibility: [],
    consoleErrors: capture.consoleErrors,
    pageErrors: capture.pageErrors,
    failedRequests: capture.failedRequests,
    matrix: {
      viewports: ["1440x900", "1024x768", "390x844"],
      themes: ["light", "dark"],
      experienceLevels: ["Basic", "Intermediate", "Advanced"],
      navigation: ["direct URL", "refresh", "back", "forward", "keyboard focus"],
    },
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/v2/missions?workspace=${WORKSPACE_ID}`);
  await expect(page.getByRole("heading", { name: "Missions", exact: true })).toBeVisible();
  await setTheme(page, "dark");
  await expect(page.getByRole("heading", { name: "Missions", exact: true })).toBeVisible();

  const qualificationMission = page.getByRole("button", { name: new RegExp(QUALIFICATION_MISSION_TITLE) });
  if (await qualificationMission.count() === 0) {
    await page.getByRole("button", { name: "Define mission", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Start governed work" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Mission title").fill(QUALIFICATION_MISSION_TITLE);
    await dialog.getByLabel("What should Mission Control build?").fill("Prove direct routing, responsive presentation, exact Spec lineage, and trustworthy operator state for the V2 factory qualification.");
    await dialog.getByRole("button", { name: "Create Mission draft", exact: true }).click();
  } else {
    await qualificationMission.click();
  }
  await expect(page.getByRole("heading", { name: QUALIFICATION_MISSION_TITLE, exact: true })).toBeVisible();
  evidence.missionUrl = page.url();
  evidence.surfaces.push("mission-creation-detail-dark-1440");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "01-mission-created-detail-1440-dark");
  await auditMain(page, testInfo, evidence, "mission-detail");

  await page.reload();
  await expect(page.getByRole("heading", { name: QUALIFICATION_MISSION_TITLE, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Missions", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: QUALIFICATION_MISSION_TITLE, exact: true })).toBeVisible();

  await page.goto(`${APP_URL}/v2/missions?workspace=${WORKSPACE_ID}`);
  const seededMission = page.getByRole("button", { name: new RegExp(SEEDED_MISSION_TITLE) });
  await expect(seededMission).toBeVisible();
  await seededMission.click();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revision 1 approved and released", exact: true })).toBeVisible();
  await expect(page.getByText("Execution remains a separate governed action.", { exact: true })).toBeVisible();
  await setTheme(page, "light");
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revision 1 approved and released", exact: true })).toBeVisible();
  evidence.surfaces.push("approved-plan-light-1440");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "02-approved-plan-1440-light");

  await page.goto(`${APP_URL}/v2/missions?workspace=${WORKSPACE_ID}`);
  const specMission = page.getByRole("button", { name: new RegExp(SPEC_MISSION_TITLE) });
  await expect(specMission).toBeVisible();
  await specMission.click();
  await expect(page.getByRole("heading", { name: SPEC_MISSION_TITLE, exact: true })).toBeVisible();
  await setTheme(page, "dark");
  await page.getByRole("tab", { name: "Specification", exact: true }).click();
  await expect(page.getByText("Specification contract", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Immutable revision history", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requirements coverage matrix", exact: true })).toBeVisible();
  const specHistory = page.locator('[aria-label="Immutable Mission Spec revision history"]');
  const coverageMatrix = page.locator('[aria-label="Mission Spec requirements coverage matrix"]');
  await expect(specHistory).toContainText("r1");
  await expect(specHistory).toContainText("r2");
  await expect(specHistory).toContainText("r3");
  await expect(specHistory).toContainText("FINALIZED");
  await expect(coverageMatrix).toContainText("REQ-001");
  await expect(coverageMatrix).toContainText("NFR-001");
  evidence.surfaces.push("spec-r1-r2-r3-lineage-dark-1440");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "03-spec-lineage-1440-dark");
  await auditMain(page, testInfo, evidence, "spec-lineage");

  await setTheme(page, "light");
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Frozen planning lineage", exact: true })).toBeVisible();
  await expect(page.getByText("Coverage complete", { exact: true })).toBeVisible();
  await expect(page.getByText("r2", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revision 1 approved and released", exact: true })).toBeVisible();
  evidence.surfaces.push("frozen-plan-spec-r2-light-1440");
  await captureScreenshot(page, evidence, "04-frozen-plan-spec-r2-1440-light");

  await page.getByRole("tab", { name: "Work Orders", exact: true }).click();
  await expect(page.getByRole("link", { name: /Implement Spec-driven Mission intake.*AWAITING_APPROVAL/ })).toBeVisible();

  await page.goto(`${APP_URL}/v2/missions?workspace=${WORKSPACE_ID}`);
  await seededMission.click();
  await page.getByRole("tab", { name: "Work Orders", exact: true }).click();
  const workOrderLink = page.getByRole("link", { name: /Implement the mission outcome.*AWAITING_VERIFICATION/ }).first();
  await expect(workOrderLink).toBeVisible();
  const workOrderHref = await workOrderLink.getAttribute("href");
  expect(workOrderHref).toBeTruthy();
  await page.setViewportSize({ width: 1024, height: 768 });
  await setTheme(page, "dark");
  await page.goto(new URL(workOrderHref!, APP_URL).toString());
  await expect(page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to work orders", exact: true })).toBeVisible();
  const acceptanceBlocker = page.getByText("Acceptance remains blocked until all required approvals", { exact: false });
  await expect(acceptanceBlocker).toBeVisible();
  await expect(page.getByText("Explicit acceptance is now allowed.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept WorkOrder", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back to work orders", exact: true })).toBeFocused();
  evidence.surfaces.push("workorder-verification-dark-1024");
  await expectNoHorizontalOverflow(page);
  await acceptanceBlocker.scrollIntoViewIfNeeded();
  await captureScreenshot(page, evidence, "05-workorder-verification-1024-dark");

  await page.getByRole("button", { name: "Inspect run", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Execution Run Inspector" })).toBeVisible();
  await expect(page.getByText("Independent verification", { exact: true }).last()).toBeVisible();
  evidence.surfaces.push("execution-run-inspector");
  await page.getByRole("dialog", { name: "Execution Run Inspector" }).getByRole("button", { name: "Close" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/v2/control-work-orders?workspace=${PR_WORKSPACE_ID}&workOrder=${PR_WORK_ORDER_ID}`);
  await setTheme(page, "light");
  await expect(page.getByText("V1 current-main governed canary", { exact: true }).last()).toBeVisible();
  const prCurrentness = page.getByText("Pull request and exact-head CI", { exact: true });
  await expect(prCurrentness).toBeVisible();
  await expect(page.getByText("PR OPEN", { exact: true })).toBeVisible();
  await expect(page.getByText("STALE", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pull request", exact: true })).toHaveAttribute("href", "https://github.com/jaydubya818/MissionControl/pull/84");
  evidence.surfaces.push("pr-currentness-light-1440");
  await expectNoHorizontalOverflow(page);
  const reviewPackage = page.locator("#run-review-package");
  await expectNoElementHorizontalOverflow(reviewPackage, "PR review package");
  expect((await reviewPackage.boundingBox())?.width ?? 0, "PR review package readable width").toBeGreaterThanOrEqual(600);
  await prCurrentness.scrollIntoViewIfNeeded();
  await captureScreenshot(page, evidence, "06-pr-currentness-1440-light");
  await auditMain(page, testInfo, evidence, "workorder-pr-currentness");

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${APP_URL}/v2/memory?workspace=${WORKSPACE_ID}`);
  await setTheme(page, "light");
  await expect(page.getByRole("heading", { name: "Factory Memory", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Context/ }).click();
  await expect(page.getByText("Frozen Attempt context", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Selected context and provenance" })).toBeVisible();
  evidence.surfaces.push("factory-memory-context-light-1024");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "07-factory-memory-context-1024-light");
  await auditMain(page, testInfo, evidence, "factory-memory");

  await page.goto(`${APP_URL}/v2/trace-inspector?workspace=${WORKSPACE_ID}`);
  await setTheme(page, "dark");
  await expect(page.getByRole("heading", { name: "Observability & Evals", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Eval library/ }).click();
  await expect(page.getByRole("tab", { name: /^Datasets & experiments/ })).toBeVisible();
  evidence.surfaces.push("observability-evals-dark-1024");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "08-observability-evals-1024-dark");
  await auditMain(page, testInfo, evidence, "observability-evals");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_URL}/v2/factory?workspace=${WORKSPACE_ID}`);
  await setTheme(page, "dark");
  await expect(page.getByRole("heading", { name: "From intent to verified change", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Improvements", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Evidence before change", exact: true })).toBeVisible();
  await expect(page.getByText("Factory Learning cannot accept work", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Intermediate", exact: true }).click();
  await page.getByRole("button", { name: "Signals", exact: true }).click();
  await expect(page.getByText(/No recurring signal clusters|Recurring clusters/).first()).toBeVisible();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("button", { name: "Experiments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No approved learning experiments", exact: true })).toBeVisible();
  await expect(page.getByText("Auto-promotion", { exact: true })).toBeVisible();
  await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  evidence.surfaces.push("factory-learning-dark-390");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "09-factory-learning-390-dark");
  await auditMain(page, testInfo, evidence, "factory-learning");

  await page.goto(evidence.missionUrl!);
  await setTheme(page, "light");
  await expect(page.getByRole("heading", { name: QUALIFICATION_MISSION_TITLE, exact: true })).toBeVisible();
  evidence.surfaces.push("mission-direct-light-390");
  await expectNoHorizontalOverflow(page);
  await captureScreenshot(page, evidence, "10-mission-direct-390-light");

  expect(capture.consoleErrors).toEqual([]);
  expect(capture.pageErrors).toEqual([]);
  expect(capture.failedRequests).toEqual([]);

  await writeFile(path.join(EVIDENCE_DIR, "browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
});
