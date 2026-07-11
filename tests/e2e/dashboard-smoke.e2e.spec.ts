import { expect, test, type Page } from "@playwright/test";

async function expectShellLoaded(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Command center navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
}

/**
 * Smoke E2E: Dashboard and home load with Convex (dev or deployed).
 * webServer in playwright.config.ts runs UI with VITE_CONVEX_URL so Convex dev can back the test.
 */
test("home dashboard loads and shows main sections", async ({ page }) => {
  await expectShellLoaded(page);

  // Home section: quick navigation or status
  await expect(page.getByText("Quick Navigation", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("navigate to Tasks and back to Home", async ({ page }) => {
  await expectShellLoaded(page);

  const commandNav = page.getByRole("navigation", { name: "Command center navigation" });
  const opsNav = commandNav.getByRole("button", { name: "Operations", exact: true });
  await opsNav.click();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 8000 });

  const homeNav = commandNav.getByRole("button", { name: "Home", exact: true });
  await homeNav.click();
  await expect(page.getByText("Quick Navigation", { exact: true })).toBeVisible({ timeout: 8000 });
});
