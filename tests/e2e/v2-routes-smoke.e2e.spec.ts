import { expect, test } from "@playwright/test";

const ROUTES: Array<{ route: string; heading: string; text?: string | RegExp }> = [
  { route: "home", heading: "Overview" },
  { route: "goals", heading: "Goals" },
  { route: "tasks", heading: "Tasks" },
  { route: "dag", heading: "Mission DAG" },
  { route: "calendar", heading: "Calendar" },
  { route: "ops-schedule", heading: "Schedule" },
  { route: "audit", heading: "ARM Audit" },
  { route: "control-portfolio", heading: "Portfolio" },
  { route: "control-work-orders", heading: "Work Orders" },
  { route: "control-fleet", heading: "Control" },
  { route: "control-approvals", heading: "Approval Center" },
  { route: "code", heading: "Code Pipeline" },
  { route: "codegen", heading: "CodeGen Agent" },
  { route: "recorder", heading: "Recorder Agent" },
  { route: "test-generation", heading: "Test Generation" },
  { route: "api-import", heading: "API Import" },
  { route: "execution", heading: "Execution Engine" },
  { route: "flaky-steps", heading: "Flaky Detection" },
  { route: "hybrid-workflows", heading: "Hybrid Workflows" },
  { route: "gherkin", heading: "Gherkin Studio" },
  { route: "schedule", heading: "Schedule" },
  { route: "pipeline", heading: "Build Pipeline" },
  { route: "factory", heading: "Factory" },
  { route: "agents", heading: "Agent Registry" },
  { route: "atc", heading: "Air Traffic Control" },
  { route: "directory", heading: "Templates" },
  { route: "identity", heading: "Identity Directory" },
  { route: "skills", heading: "Registry" },
  { route: "memory", heading: "Memory" },
  { route: "docs", heading: "Documentation" },
  { route: "search", heading: "Search" },
  { route: "hiring", heading: "Hiring" },
  { route: "telemetry", heading: "ARM Telemetry" },
  { route: "metrics", heading: "Metrics" },
  { route: "qc-dashboard", heading: "Quality Control" },
  { route: "qc-runs", heading: "Quality Control" },
  { route: "qc-findings", heading: "Findings" },
  { route: "qc-metrics", heading: "Metrics" },
  { route: "qc-environments", heading: "Environments" },
  { route: "radar", heading: "Radar" },
  { route: "system", heading: "System" },
  { route: "policies", heading: "Policies" },
  { route: "deployments", heading: "Deployments" },
  { route: "qc-rulesets", heading: "Rulesets" },
  { route: "gateway", heading: "OpenClaw Gateway" },
  { route: "schedules", heading: "Schedules" },
  { route: "design-system", heading: "Design DNA" },
  { route: "chat", heading: "Chat" },
  { route: "live-chat", heading: "Live Agent Chat", text: /Orchestration server unavailable|Connect to the OpenClaw Gateway/i },
  { route: "command", heading: "Command Panel" },
  { route: "council", heading: "Council" },
  { route: "content-pipeline", heading: "Content Pipeline" },
  { route: "captures", heading: "Captures" },
  { route: "projects", heading: "Projects" },
  { route: "telegraph", heading: "Telegraph" },
  { route: "meetings", heading: "Meetings" },
  { route: "voice", heading: "Voice" },
  { route: "crm", heading: "CRM" },
  { route: "people", heading: "People" },
  { route: "team", heading: "Team" },
  { route: "org", heading: "Org Chart" },
  { route: "office", heading: "Office" },
  { route: "live-office", heading: "Live Office" },
  { route: "feedback", heading: "Feedback" },
  { route: "command-center", heading: "Command Center", text: "Active mission" },
  { route: "harness-health", heading: "Factory Health" },
  { route: "harness-loops", heading: "Harness Loops" },
  { route: "harness-control-plane", heading: "Control Plane" },
  { route: "harness-work-ledger", heading: "Work Ledger" },
  { route: "harness-verifiers", heading: "Verifiers" },
  { route: "harness-meta-loop", heading: "Meta Loop Inbox" },
  { route: "harness-code-review-wizard", heading: "Code Review Setup" },
  { route: "harness-software-factory", heading: "AI developer workflows" },
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
