import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["dark", "light"]) {
  for (const width of [1280, 390]) {
    test(`review questions preserve blocked evidence at ${width}px in ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?theme=${theme}`);
      await expect(page.getByRole("heading", { name: "Review questions" })).toBeVisible();
      await expect(page.getByRole("status").first()).toHaveText("BLOCKED");
      await expect(page.getByRole("heading", { name: "Rollback cost" })).toBeVisible();
      await expect(page.getByText("Application-error detection has no current independent observation.")).toBeVisible();
      await page.getByRole("button", { name: "Advanced", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(/Verifier host: Unknown/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(accessibility.violations).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: `test-results/factory-review/review-${theme}-${width}.png`, fullPage: true });
    });
  }
}

test("recipe recommendation and explicit override stay draft-only", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto("/?view=recipe");
  const recipe = page.getByLabel("Workflow recipe", { exact: true });
  await expect(recipe).toHaveValue("scout");
  await recipe.selectOption("quality");
  await expect(page.getByText(/Override recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Create Mission draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft captured by the local fixture.");
  const draft = JSON.parse(await page.getByTestId("captured-draft").innerText());
  expect(draft.metadata.factoryExperience).toMatchObject({ recommendedRecipeId: "scout", selectedRecipeId: "quality", operatorOverrodeRecommendation: true });
  for (const field of ["dispatch", "approved", "accepted", "merge"]) expect(draft).not.toHaveProperty(field);
});

test("intake preview preserves the failed state and offers bounded processing recovery", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?view=intake&theme=light");
  await page.getByRole("button", { name: "Review intake" }).click();
  await expect(page.getByText("INTAKE_RELEASE_SCOPE_INVALID")).toBeVisible();
  await expect(page.getByText("Restoration has not been established.")).toBeVisible();
  await expect(page.getByTestId("captured-operation")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry processing" }).click();
  await expect(page.getByRole("status")).toContainText("does not dispatch application work");
  expect(JSON.parse(await page.getByTestId("captured-operation").innerText())).toEqual({
    operation: "factory/intake:retryDelivery", payload: { deliveryId: "fixture-delivery" },
  });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/factory-review/intake-light-390.png", fullPage: true });
});

test("replay preview retains unknown costs and blocked dispatch reasons", async ({ page }) => {
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto("/?view=replay");
  await page.getByRole("button", { name: "Review replay" }).click();
  await expect(page.getByText(/Attempt cost: Unknown/)).toBeVisible();
  await expect(page.getByTestId("captured-operation")).toHaveCount(0);
  await page.getByRole("button", { name: "Dispatch batch from 1" }).click();
  await expect(page.getByLabel("Blocked replay cases")).toContainText("CURRENT_APPROVAL_REQUIRED");
  await expect(page.getByRole("button", { name: "Dispatch batch complete" })).toBeDisabled();
  expect(JSON.parse(await page.getByTestId("captured-operation").innerText())).toEqual({
    operation: "factory/replay:dispatchPending", payload: { manifestId: "fixture-manifest", cursor: 0, limit: 10 },
  });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/factory-review/replay-dark-1280.png", fullPage: true });
});
