import { expect, test, type Page } from "@playwright/test";

async function expectShellLoaded(page: Page) {
  await page.goto("/v2/home");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
}

/**
 * Smoke E2E: Dashboard and home load with Convex (dev or deployed).
 * webServer in playwright.config.ts runs UI with VITE_CONVEX_URL so Convex dev can back the test.
 */
test("home dashboard loads and shows main sections", async ({ page }) => {
  await expectShellLoaded(page);

  // Home section: quick navigation or status
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Needs attention", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("navigate to Tasks and back to Home", async ({ page }) => {
  await expectShellLoaded(page);

  await page.goto("/v2/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 8000 });

  await page.goto("/v2/home");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 8000 });
});
