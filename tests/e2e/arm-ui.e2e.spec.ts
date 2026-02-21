import { expect, test } from "@playwright/test";

test("ARM pages render in Mission Control shell", async ({ page }) => {
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
