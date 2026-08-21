import { expect, test, type Page } from "@playwright/test";

async function expectShellLoaded(page: Page) {
  await page.goto("/v2/home");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
}

/**
 * Deterministic shell smoke. The full qualification suite separately exercises
 * live Convex-backed records and governed detail navigation.
 */
test("home dashboard loads and shows main sections", async ({ page }) => {
  await expectShellLoaded(page);

  // Home section: quick navigation or status
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Factory overview", exact: true })).toBeVisible({ timeout: 10000 });
});

test("navigate to Tasks and back to Home", async ({ page }) => {
  await expectShellLoaded(page);

  await page.goto("/v2/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 8000 });

  await page.goto("/v2/home");
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible({ timeout: 8000 });
});

test("mobile shell keeps navigation and chat off canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/v2/control-work-orders");

  await expect(page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open chat" })).toBeVisible();

  // This shell-only suite runs without a Convex backend, so the Work Orders
  // query never resolves. The queue must say so rather than claiming the
  // workspace is empty — "no results" and "not loaded yet" are different
  // operator facts.
  await expect(page.getByText("Loading Work Orders…", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("button", { name: /Tasks/ }).click();
  await expect(page).toHaveURL(/\/v2\/tasks(?:\?.*)?$/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open chat" }).click();
  await expect(page.getByRole("complementary", { name: "Chat dock" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse chat" }).click();
  await expect(page.getByRole("complementary", { name: "Chat dock" })).toHaveCount(0);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
});
