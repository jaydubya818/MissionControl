import { expect, test } from "@playwright/test";

// This test requires a local Convex dev server running at :3210 (VITE_CONVEX_URL).
// Vite proxies /gateway/* to that port; without it the UI fails to hydrate.
// To run locally: `npx convex dev` in one terminal, then `pnpm test:e2e:arm`.
// Skipped in CI until a Convex test deployment is wired into GitHub Actions secrets.
test("ARM pages render in Mission Control shell", async ({ page }) => {
  if (process.env.CI && !process.env.CONVEX_URL) {
    test.skip(true, "Requires Convex dev server — set CONVEX_URL in CI secrets to enable");
    return;
  }

  await page.goto("/");
  await expect(page.getByText("Mission Control").first()).toBeVisible();

  await page.getByRole("button", { name: "Directory" }).click();
  await expect(page.getByRole("heading", { name: "ARM Directory" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seed Mission Control Demo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Instance Ref Backfill" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Tenant Backfill" })).toBeVisible();

  await page.getByRole("button", { name: "Policies" }).click();
  await expect(page.getByRole("heading", { name: "ARM Policies" })).toBeVisible();

  await page.getByRole("button", { name: "Deployments" }).click();
  await expect(page.getByRole("heading", { name: "ARM Deployments" })).toBeVisible();

  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "ARM Audit" })).toBeVisible();

  await page.getByRole("button", { name: "Telemetry" }).click();
  await expect(page.getByRole("heading", { name: "ARM Telemetry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Emit Test Event" })).toBeVisible();
});
