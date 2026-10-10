import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const require = createRequire(
  new URL("../../apps/mission-control-ui/package.json", import.meta.url),
);
const browser = await chromium.launch({ headless: true });
const report = {
  scope: "UI_COMPONENT_FIXTURE_ONLY",
  ownerAuthentication: "NOT_RUN",
  fullJourney: "NOT_RUN",
  checks: [],
  status: "IN_PROGRESS",
};
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const theme of ["dark", "light"]) {
    for (const scenario of [
      "signed-out",
      "proposal",
      "result",
      "expired",
      "denied",
    ]) {
      await page.goto(
        `http://127.0.0.1:5188/?scenario=${scenario}&theme=${theme}&proposal=proposal-ui-fixture&proposalDigest=sha256:fixture`,
      );
      if (scenario === "signed-out")
        await page
          .getByText(/Sign in with your MissionControl owner/)
          .waitFor();
      else if (scenario === "denied") await page.getByRole("alert").waitFor();
      else
        await page
          .getByRole("heading", { name: "Agentic HR platform" })
          .waitFor();
      if (scenario === "expired")
        assert.equal(
          await page
            .getByRole("button", { name: "Accept enterprise Result" })
            .isDisabled(),
          true,
        );
      await page.screenshot({
        path: `${output}/${theme}-${scenario}-before.png`,
        fullPage: true,
      });
      if (scenario === "proposal") {
        await page
          .getByRole("button", { name: "Authorize Mission creation" })
          .click();
        await page.getByText(/Creation authorized/).waitFor();
      }
      if (scenario === "result") {
        await page.getByLabel("Decision reason").fill("Requires revision");
        await page
          .getByRole("button", { name: "Reject enterprise Result" })
          .click();
        await page.getByText("Result rejected.", { exact: true }).waitFor();
      }
      await page.addScriptTag({
        path: createRequire(require.resolve("@axe-core/playwright")).resolve(
          "axe-core/axe.min.js",
        ),
      });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      );
      assert.deepEqual(violations, [], `${theme}/${scenario} accessibility`);
      await page.screenshot({
        path: `${output}/${theme}-${scenario}.png`,
        fullPage: true,
      });
      report.checks.push(`${theme}/${scenario}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "http://127.0.0.1:5188/?scenario=result&proposal=proposal-ui-fixture&proposalDigest=sha256:fixture",
  );
  await page.getByRole("heading", { name: "Result / Proof" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: `${output}/mobile-result.png`,
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement !== document.body),
    true,
  );
  assert.deepEqual(errors, []);
  report.checks.push("390px-reflow", "keyboard-focus", "no-page-errors");
  report.status = "PASS";
} catch (e) {
  report.status = "FAIL";
  report.error = String(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
