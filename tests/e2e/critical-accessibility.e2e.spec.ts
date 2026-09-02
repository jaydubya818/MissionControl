import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const CRITICAL_ROUTES = [
  { route: "/v2/home", heading: "Command Center" },
  { route: "/v2/tasks", heading: "Tasks" },
  { route: "/v2/control-work-orders", heading: "Work Orders" },
  { route: "/v2/control-approvals", heading: "Decision Center" },
  { route: "/v2/automations", heading: "Automations" },
] as const;

const CONTRAST_ROUTES = CRITICAL_ROUTES.filter(({ route }) => [
  "/v2/home",
  "/v2/control-work-orders",
  "/v2/automations",
].includes(route));

const ACCESSIBILITY_SCENARIOS = [
  { name: "wide-dark", width: 1440, height: 1000, theme: "dark" },
  { name: "wide-light", width: 1440, height: 1000, theme: "light" },
  { name: "narrow-dark", width: 760, height: 900, theme: "dark" },
  { name: "narrow-light", width: 760, height: 900, theme: "light" },
] as const;

function watchBrowserFailures(page: Page) {
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onRequestFailed = (request: {
    method(): string;
    url(): string;
    failure(): { errorText?: string } | null;
  }) => {
    const errorText = request.failure()?.errorText;
    if (errorText === "net::ERR_ABORTED" || request.url().includes("/gateway/status")) {
      return;
    }
    requestFailures.push(`${request.method()} ${request.url()} :: ${errorText}`);
  };

  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);

  return {
    pageErrors,
    requestFailures,
    dispose() {
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);
    },
  };
}

async function getAccessibilityViolations(
  page: Page,
  testInfo: TestInfo,
  evidenceName: string,
  include?: string
) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (include) {
    builder = builder.include(include);
  }

  const results = await builder.analyze();
  await testInfo.attach(`${evidenceName}-axe-results`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  return results.violations;
}

async function assertNoCriticalAccessibilityViolations(
  page: Page,
  testInfo: TestInfo,
  evidenceName: string,
  include?: string
) {
  const criticalViolations = (await getAccessibilityViolations(page, testInfo, evidenceName, include))
    .filter((violation) => violation.impact === "critical");
  const evidence = criticalViolations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target),
  }));

  expect(
    criticalViolations,
    `Critical accessibility violations:\n${JSON.stringify(evidence, null, 2)}`
  ).toEqual([]);
}

for (const entry of CRITICAL_ROUTES) {
  test(`${entry.heading} has no critical accessibility violations`, async ({
    page,
  }, testInfo) => {
    const browserFailures = watchBrowserFailures(page);

    try {
      await page.goto(entry.route);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: entry.heading, exact: true }).first()
      ).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL((url) => url.pathname === entry.route);

      await assertNoCriticalAccessibilityViolations(
        page,
        testInfo,
        entry.route.replaceAll("/", "-").replace(/^-/, "")
      );

      expect(browserFailures.pageErrors).toEqual([]);
      expect(browserFailures.requestFailures).toEqual([]);
    } finally {
      browserFailures.dispose();
    }
  });
}

for (const entry of CONTRAST_ROUTES) {
  test(`${entry.heading} has no color contrast violations across supported themes and viewports`, async ({
    page,
  }, testInfo) => {
    for (const scenario of ACCESSIBILITY_SCENARIOS) {
      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.goto(entry.route);
      await expect(
        page.getByRole("heading", { name: entry.heading, exact: true }).first()
      ).toBeVisible({ timeout: 15_000 });
      await page.locator("html").evaluate((element, theme) => {
        element.setAttribute("data-theme", theme);
      }, scenario.theme);

      const contrastViolations = (await getAccessibilityViolations(
        page,
        testInfo,
        `${entry.route.replaceAll("/", "-").replace(/^-/, "")}-${scenario.name}`
      )).filter((violation) => violation.id === "color-contrast");
      const evidence = contrastViolations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      }));
      expect(
        contrastViolations,
        `Color contrast violations:\n${JSON.stringify(evidence, null, 2)}`
      ).toEqual([]);
    }
  });
}

test("PRD import dialog is named, keyboard reachable, and has no critical violations", async ({
  page,
}, testInfo) => {
  const browserFailures = watchBrowserFailures(page);

  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/v2/tasks");
    await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Import PRD", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Import PRD" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Paste your PRD markdown here...")).toBeFocused();

    await assertNoCriticalAccessibilityViolations(
      page,
      testInfo,
      "prd-import-dialog",
      '[role="dialog"]'
    );

    expect(browserFailures.pageErrors).toEqual([]);
    expect(browserFailures.requestFailures).toEqual([]);
  } finally {
    browserFailures.dispose();
  }
});
