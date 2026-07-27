import { expect, test, type Page } from "@playwright/test";

async function expectShellLoaded(page: Page) {
  await page.goto("/v2/home");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
}

test("ARM pages render in Mission Control shell", async ({ page }) => {
  await expectShellLoaded(page);

  await page.goto("/v2/directory");
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(page.getByText("ARM template registry: version lineage and instances")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dev Tools" })).toBeVisible();

  await page.goto("/v2/policies");
  await expect(page.getByRole("heading", { name: "Policies" })).toBeVisible();

  await page.goto("/v2/deployments");
  await expect(page.getByRole("heading", { name: "Deployments" })).toBeVisible();

  await page.goto("/v2/audit");
  await expect(page.getByRole("heading", { name: "ARM Audit" })).toBeVisible();

  await page.goto("/v2/telemetry");
  await expect(page.getByRole("heading", { name: "ARM Telemetry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Emit Test Event" })).toBeVisible();
});
