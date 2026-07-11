import { expect, test, type Page } from "@playwright/test";

async function expectShellLoaded(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Command center navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
}

test("ARM pages render in Mission Control shell", async ({ page }) => {
  await expectShellLoaded(page);

  const commandNav = page.getByRole("navigation", { name: "Command center navigation" });

  await commandNav.getByRole("button", { name: "Agents", exact: true }).click();

  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
  await expect(page.getByText("ARM template registry: version lineage and instances")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dev Tools" })).toBeVisible();

  await page.getByRole("tab", { name: "Policies", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Policies" })).toBeVisible();

  await page.getByRole("tab", { name: "Deployments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deployments" })).toBeVisible();

  await commandNav.getByRole("button", { name: "Operations", exact: true }).click();
  await page.getByRole("tab", { name: "Audit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ARM Audit" })).toBeVisible();

  await page.getByRole("tab", { name: "Telemetry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ARM Telemetry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Emit Test Event" })).toBeVisible();
});
