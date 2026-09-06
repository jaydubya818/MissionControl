import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const APP_URL = process.env.MISSION_CONTROL_URL ?? "";
const WORKSPACE_ID = process.env.SHARED_INTENT_WORKSPACE_ID ?? "";
const READ_ONLY = process.env.SHARED_INTENT_EXPECT_READ_ONLY === "true";
const MISSION_TITLE = "Spec Intake Golden Path — immutable revision proof";
const SCREENSHOTS = path.resolve("docs/testing/evidence/shared-builder-intent-todo062/screenshots");

test("shared builder intent remains one governed, accessible Mission lineage", async ({ page }) => {
  test.skip(!APP_URL || !WORKSPACE_ID, "Set the real local app URL and demo workspace ID.");
  await mkdir(SCREENSHOTS, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/v2/missions?workspace=${WORKSPACE_ID}`);
  await page.getByRole("button", { name: new RegExp(MISSION_TITLE) }).click();
  await page.getByRole("tab", { name: "Specification", exact: true }).click();
  const panel = page.getByRole("region", { name: "Shared builder contributions" });
  await expect(panel).toBeVisible();

  if (READ_ONLY) {
    await expect(panel.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(panel.getByText(/Shared contribution writes are disabled/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save proposal" })).toBeDisabled();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SCREENSHOTS, "03-permission-denied-1440-dark.png") });
    expect(pageErrors).toEqual([]);
    return;
  }

  await expect(panel.getByText("Proposal-only", { exact: true })).toBeVisible();
  await expect(panel.getByText("ACCEPTED", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("CONFLICT", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("STALE", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/agent design-agent/)).toBeVisible();
  await expect(panel.getByText(/Decision by/).first()).toBeVisible();
  await expect(panel.getByRole("button", { name: "Accept as Spec input" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Revise against current" }).first()).toBeEnabled();

  const wideOverflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(wideOverflow.scroll).toBeLessThanOrEqual(wideOverflow.width + 1);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SCREENSHOTS, "01-shared-intent-1440-dark.png") });
  await panel.getByText("ACCEPTED", { exact: true }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SCREENSHOTS, "04-shared-intent-states-1440-dark.png") });

  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);

  await page.reload();
  await page.getByRole("tab", { name: "Specification", exact: true }).click();
  await expect(page.getByRole("region", { name: "Shared builder contributions" }).getByText("ACCEPTED", { exact: true }).first()).toBeVisible();

  await page.evaluate(() => localStorage.setItem("mc.theme", "light"));
  await page.reload();
  await page.getByRole("tab", { name: "Specification", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowPanel = page.getByRole("region", { name: "Shared builder contributions" });
  await narrowPanel.scrollIntoViewIfNeeded();
  await expect(narrowPanel.getByLabel("Contributor role")).toBeVisible();
  await narrowPanel.getByLabel("Contributor role").focus();
  await expect(narrowPanel.getByLabel("Contributor role")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(narrowPanel.getByLabel("Spec target")).toBeFocused();
  const narrowOverflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(narrowOverflow.scroll).toBeLessThanOrEqual(narrowOverflow.width + 1);
  await page.screenshot({ path: path.join(SCREENSHOTS, "02-shared-intent-390-light.png") });
  expect(pageErrors).toEqual([]);
});
