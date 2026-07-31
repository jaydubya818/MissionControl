import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function relevantViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(WCAG_TAGS)
    .analyze();

  return results.violations
    .filter((violation) => ["color-contrast", "target-size"].includes(violation.id))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        data: node.any.map((check) => check.data),
      })),
    }));
}

test("Task drawer contrast and close target pass in dark and light themes", async ({
  page,
}) => {
  await page.goto("/v2/tasks");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  const firstTask = page.locator('[role="button"][aria-label^="Open task "]').first();
  await expect(firstTask).toBeVisible();
  await firstTask.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);

  expect(await relevantViolations(page)).toEqual([]);

  await page.locator("html").evaluate((element) => element.setAttribute("data-theme", "light"));
  await page.waitForTimeout(500);
  expect(await relevantViolations(page)).toEqual([]);
});
