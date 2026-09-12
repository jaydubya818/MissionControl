import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const BUILDER_LOOP = "Intent → Plan → Configure agents, harnesses, skills, and tools → Execute → Verify and evaluate → Deliver → Observe → Improve";
export const GOVERNED_LIFECYCLE = "Mission → approved Plan → WorkOrder → Task → Attempt → candidate → independent evidence → pull request → human decision → release → observed outcome → governed learning";

const CURRENT_DOCS = [
  "README.md",
  "docs/OVERVIEW.md",
  "docs/product/software-factory-capability-maturity.md",
  "docs/software-factory/README.md",
  "docs/software-factory/remote-sandbox-runtime.md",
  "docs/MISSION_CONTROL_RUNBOOK.md",
];

const REQUIRED_CAPABILITIES = [
  "Governed intent, Plans, and WorkOrders",
  "Agent definitions and Factory binding",
  "Generic Harness Contract",
  "Model/harness/backend routing",
  "Independent verification and Quality Gates",
  "Observability, traces, and evals",
  "Factory Learning",
  "Remote Sandbox",
  "Tools/MCP runtime",
  "Factory incident response",
  "Cost per accepted outcome",
  "Multi-tenant enterprise operation",
  "Adoption and builder outcomes",
];

export function checkFactoryDocs({ repositoryRoot }) {
  const findings = [];
  const read = (relativePath) => {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!existsSync(absolutePath)) {
      findings.push(`${relativePath}: required documentation file is missing`);
      return "";
    }
    return readFileSync(absolutePath, "utf8");
  };

  const readme = read("README.md");
  const overview = read("docs/OVERVIEW.md");
  const ledger = read("docs/product/software-factory-capability-maturity.md");
  const runtimeSource = read("convex/lib/runtimeContract.ts");
  const currentRunbook = read("docs/MISSION_CONTROL_RUNBOOK.md");
  const historicalRunbook = read("docs/runbook/RUNBOOK.md");
  const historicalAssessment = read("docs/mission-control-existing-system-assessment.md");
  const historicalMap = read("docs/plans/software-factory-capability-map.md");
  const observabilityPlan = read("docs/plans/2026-08-15-feat-observability-traces-evals-v1-plan.md");
  const remoteSandbox = read("docs/software-factory/remote-sandbox-runtime.md");

  checkRuntimeVersion({
    filePath: "README.md",
    source: readme,
    documentedVersionPattern: /runtime contract:\s*\*\*v(\d+)\*\*/,
    runtimeSource,
    findings,
  });
  checkRuntimeVersion({
    filePath: "docs/OVERVIEW.md",
    source: overview,
    documentedVersionPattern: /runtime contract is \*\*v(\d+)\*\*/,
    runtimeSource,
    findings,
  });
  checkLifecycle({ filePath: "docs/OVERVIEW.md", source: overview, findings });
  checkLifecycle({ filePath: "docs/product/software-factory-capability-maturity.md", source: ledger, findings });

  for (const capability of REQUIRED_CAPABILITIES) {
    if (!ledger.includes(`| ${capability} |`)) {
      findings.push(`docs/product/software-factory-capability-maturity.md: missing capability row ${capability}`);
    }
  }

  if (!overview.includes("**Production-pilot eligible; Preview**") || !overview.includes("3/3 live exe.dev cohort")) {
    findings.push("docs/OVERVIEW.md: Remote Sandbox must distinguish bounded live pilot evidence from general production certification");
  }
  if (!remoteSandbox.includes("Production-pilot eligible / Preview; not general production certified")) {
    findings.push("docs/software-factory/remote-sandbox-runtime.md: current Remote Sandbox boundary is missing or stale");
  }

  if (/localhost:3000\/api\//.test(currentRunbook) || /Express REST API/i.test(currentRunbook)) {
    findings.push("docs/MISSION_CONTROL_RUNBOOK.md: current runbook references the retired REST/Express contract");
  }
  if (!historicalRunbook.includes("Historical runbook — do not execute these commands.")) {
    findings.push("docs/runbook/RUNBOOK.md: retired REST runbook is not labeled historical");
  }
  if (frontmatterStatus(historicalAssessment) !== "historical-baseline") {
    findings.push("docs/mission-control-existing-system-assessment.md: historical assessment is not labeled historical-baseline");
  }
  if (frontmatterStatus(historicalMap) !== "superseded") {
    findings.push("docs/plans/software-factory-capability-map.md: historical capability map is not superseded");
  }
  if (!["complete", "completed"].includes(frontmatterStatus(observabilityPlan))) {
    findings.push("docs/plans/2026-08-15-feat-observability-traces-evals-v1-plan.md: implemented diagnostic system is not marked complete");
  }

  checkQualifiedPlanLinks({ repositoryRoot, ledger, findings });
  for (const relativePath of CURRENT_DOCS) {
    checkRelativeLinks({ repositoryRoot, relativePath, source: read(relativePath), findings });
  }

  return { ok: findings.length === 0, findings };
}

function checkRuntimeVersion({ filePath, source, documentedVersionPattern, runtimeSource, findings }) {
  const sourceVersion = runtimeSource.match(/RUNTIME_CONTRACT_VERSION\s*=\s*(\d+)/)?.[1];
  const documentedVersion = source.match(documentedVersionPattern)?.[1];
  if (!sourceVersion) findings.push("convex/lib/runtimeContract.ts: runtime contract version is unreadable");
  if (!documentedVersion) findings.push(`${filePath}: runtime contract version claim is missing`);
  if (sourceVersion && documentedVersion && sourceVersion !== documentedVersion) {
    findings.push(`${filePath}: runtime contract v${documentedVersion} does not match source v${sourceVersion}`);
  }
}

function checkLifecycle({ filePath, source, findings }) {
  if (!source.includes(BUILDER_LOOP)) findings.push(`${filePath}: canonical builder loop is missing or changed`);
  if (!source.includes(GOVERNED_LIFECYCLE)) findings.push(`${filePath}: governed delivery lifecycle is missing or changed`);
}

function checkQualifiedPlanLinks({ repositoryRoot, ledger, findings }) {
  for (const line of ledger.split("\n")) {
    if (!line.startsWith("|") || !/\*\*(?:Qualified|Implemented|Production admission)/.test(line)) continue;
    for (const match of line.matchAll(/\[[^\]]+\]\((\.\.\/plans\/[^)#]+\.md)(?:#[^)]+)?\)/g)) {
      const target = path.resolve(repositoryRoot, "docs/product", match[1]);
      if (!existsSync(target)) continue;
      const status = frontmatterStatus(readFileSync(target, "utf8"));
      if (!["complete", "completed"].includes(status)) {
        findings.push(`docs/product/software-factory-capability-maturity.md: qualified capability points to plan status ${status || "missing"}: ${path.relative(repositoryRoot, target)}`);
      }
    }
  }
}

function checkRelativeLinks({ repositoryRoot, relativePath, source, findings }) {
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const absoluteTarget = path.resolve(repositoryRoot, path.dirname(relativePath), target);
    if (!existsSync(absoluteTarget)) findings.push(`${relativePath}: broken relative link ${target}`);
  }
}

function frontmatterStatus(source) {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return frontmatter.match(/^status:\s*["']?([^\n"']+)/m)?.[1]?.trim().toLowerCase() ?? "";
}
