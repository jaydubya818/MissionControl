import { expect, test } from "@playwright/test";

const ROUTES: Array<{ route: string; heading: string; text?: string | RegExp }> = [
  // Keep this list aligned with the routes marked `live` in
  // shellV2/routeCapabilities.ts. Preview and demo routes are exercised only
  // by their feature-specific suites because production navigation hides them.
  { route: "command-center", heading: "Command Center" },
  { route: "tasks", heading: "Tasks" },
  { route: "control-work-orders", heading: "Work Orders" },
  { route: "control-approvals", heading: "Decision Center" },
  { route: "factory", heading: "From intent to verified change" },
  { route: "agents", heading: "Agent Registry" },
  { route: "atc", heading: "Air Traffic Control" },
  { route: "audit", heading: "ARM Audit" },
  { route: "telemetry", heading: "Factory Incidents" },
  { route: "automations", heading: "Automations" },
  { route: "automation-runs", heading: "Automations" },
  { route: "skills", heading: "Discover skills" },
  { route: "memory", heading: "Factory Memory" },
  { route: "docs", heading: "Documentation" },
  { route: "identity", heading: "Identity Directory" },
  { route: "deployments", heading: "Deployments" },
  { route: "projects", heading: "Workspaces & Repositories" },
  { route: "model-routing", heading: "Execution Routing" },
  { route: "operator-evals", heading: "Operator Evals" },
  { route: "harness-loops", heading: "Loop Engineering" },
  { route: "missions", heading: "Missions" },
];

test("v2 routes render in the software-factory shell", async ({ page }) => {
  for (const entry of ROUTES) {
    await test.step(entry.route, async () => {
      const pageErrors: string[] = [];
      const requestFailures: string[] = [];
      const onPageError = (error: Error) => pageErrors.push(error.message);
      const onRequestFailed = (request: { method(): string; url(): string; failure(): { errorText?: string } | null }) => {
        const errorText = request.failure()?.errorText;
        const url = request.url();
        if (errorText === "net::ERR_ABORTED") return;
        if (url.includes("/gateway/status")) return;
        requestFailures.push(`${request.method()} ${url} :: ${errorText}`);
      };

      page.on("pageerror", onPageError);
      page.on("requestfailed", onRequestFailed);

      try {
        await page.goto(`/v2/${entry.route}`);
        await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
        await expect(page.getByRole("main")).toHaveCount(1);
        await expect(page.getByRole("heading", { name: entry.heading, exact: true }).first()).toBeVisible();

        if (entry.text) {
          await expect(page.getByText(entry.text).first()).toBeVisible();
        }

        expect(pageErrors).toEqual([]);
        expect(requestFailures).toEqual([]);
      } finally {
        page.off("pageerror", onPageError);
        page.off("requestfailed", onRequestFailed);
      }
    });
  }
});
