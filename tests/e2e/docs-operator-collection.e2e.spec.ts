import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const WORKSPACE_ID = "sn71gskbdemgf4z1trt9zdmm5h8bde69";
const INVALID_DOCS_WORKSPACE_ID = "w17bnnjbwzws1rdyvg97s9cwxd8bfda8";
const APP_URL = process.env.MISSION_CONTROL_URL ?? "";
const EVIDENCE_DIR = path.resolve("docs/testing/evidence/mission-control-docs");

test.use({ trace: "off" });

test("operator Docs collection is searchable, URL-addressable, persistent, and accessible", async ({
  page,
  context,
}) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText;
    if (failure !== "net::ERR_ABORTED" && !request.url().includes("/gateway/status")) {
      failedRequests.push(`${request.method()} ${request.url()} :: ${failure}`);
    }
  });

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `${APP_URL}/v2/docs?workspace=${WORKSPACE_ID}&doc=sfe-overview`
    );
    await expect(
      page.getByRole("heading", {
        name: "Software Factory Enhancement Overview",
        exact: true,
      })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("combobox", { name: "Workspace" }).first()).toHaveValue(
      WORKSPACE_ID
    );
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "playwright-overview.png"),
      fullPage: true,
    });

    const filter = page.getByRole("searchbox", { name: "Filter documentation" });
    await filter.fill("Mission Control Docs Product Assessment");
    const result = page.getByRole("button", {
      name: "Mission Control Docs Product Assessment",
      exact: true,
    });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(
      new RegExp(`workspace=${WORKSPACE_ID}.*doc=sfe-docs-assessment`)
    );
    await expect(
      page.getByRole("heading", {
        name: "Mission Control Docs Product Assessment",
        exact: true,
      })
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Mission Control Docs Product Assessment",
        exact: true,
      })
    ).toBeVisible();

    await page.goBack();
    await expect(
      page.getByRole("heading", {
        name: "Software Factory Enhancement Overview",
        exact: true,
      })
    ).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole("heading", {
        name: "Mission Control Docs Product Assessment",
        exact: true,
      })
    ).toBeVisible();

    await page.goto(
      `${APP_URL}/v2/docs?workspace=${WORKSPACE_ID}&doc=sfe-canonical-hierarchy`
    );
    await expect(
      page.getByRole("heading", { name: "Canonical Delivery Hierarchy", exact: true })
    ).toBeVisible();
    await expect(page.getByText("SFE-DOC-002", { exact: true })).toBeVisible();

    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const critical = accessibility.violations.filter(
      (violation) => violation.impact === "critical"
    );
    expect(critical).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  } finally {
    await context.tracing.stop({
      path: path.join(EVIDENCE_DIR, "docs-ui-journey-trace.zip"),
    });
  }
});

test("invalid supplied Docs workspace is retained as reproducible defect evidence", async ({
  page,
  context,
}) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  try {
    await page.goto(
      `${APP_URL}/v2/docs?workspace=${INVALID_DOCS_WORKSPACE_ID}&doc=sfe-overview`
    );
    await expect(
      page.getByRole("heading", {
        name: "The operator console hit an unexpected error.",
        exact: true,
      })
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "playwright-invalid-workspace.png"),
      fullPage: true,
    });
  } finally {
    await context.tracing.stop({
      path: path.join(EVIDENCE_DIR, "docs-invalid-workspace-trace.zip"),
    });
  }
});
