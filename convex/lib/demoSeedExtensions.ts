/**
 * Extra demo seed data for EOS / Registry / Harness pages.
 * Called from seedMissionControlDemo after core ARM + ops data.
 */

import type { Id } from "../_generated/dataModel";
import { deriveVerificationStatus } from "./workOrderGovernance";

export type DemoSeedContext = {
  tenantId: Id<"tenants">;
  projectId: Id<"projects">;
  now: number;
  seedTag: string;
  seedVersion: string;
  withSeedMeta: (seedKey: string, extra?: Record<string, unknown>) => Record<string, unknown>;
};

const REPO_SLUG = "jaydubya818/MissionControl";

const SKILL_PACKAGES = [
  {
    slug: "mission-control/factory-health",
    name: "factory-health",
    displayName: "Factory Health Monitor",
    description: "Operational health signals for software factory throughput, human touches, and merge gates.",
    tags: ["factory", "observability", "harness"],
    qualityScore: 91,
  },
  {
    slug: "mission-control/code-review-wizard",
    name: "code-review-wizard",
    displayName: "Code Review Wizard",
    description: "Seven-step harness flow: evidence → skill match → launch → meta-loop feedback.",
    tags: ["harness", "review", "workflow"],
    qualityScore: 88,
  },
  {
    slug: "mission-control/context-compression",
    name: "context-compression",
    displayName: "Context Compression",
    description: "Token-aware context shaping for long agent sessions and registry installs.",
    tags: ["context", "optimization"],
    qualityScore: 86,
  },
  {
    slug: "cursor/create-rule",
    name: "create-rule",
    displayName: "Create Rule",
    description: "Author Cursor rules with MDC frontmatter and scoped globs.",
    tags: ["cursor", "rules"],
    qualityScore: 84,
  },
  {
    slug: "gsd/execute-phase",
    name: "execute-phase",
    displayName: "GSD Execute Phase",
    description: "Run a planned GSD phase with checkpoints and verification hooks.",
    tags: ["gsd", "planning"],
    qualityScore: 90,
  },
  {
    slug: "superpowers/test-driven-development",
    name: "test-driven-development",
    displayName: "Superpowers TDD",
    description: "Red-green-refactor discipline for orchestration-critical code paths.",
    tags: ["superpowers", "testing"],
    qualityScore: 93,
  },
  {
    slug: "harness/change-review",
    name: "change-review",
    displayName: "Harness Change Review",
    description: "Lens-based PR review with mutation testing and merge gate commentary.",
    tags: ["harness", "security"],
    qualityScore: 87,
  },
  {
    slug: "mission-control/eval-framework",
    name: "eval-framework",
    displayName: "Eval Framework Gate",
    description: "Scenario-based eval runs with baseline vs candidate scoring for registry packages.",
    tags: ["eval", "registry"],
    qualityScore: 89,
  },
  {
    slug: "anthropic/skill-creator",
    name: "skill-creator",
    displayName: "Skill Creator",
    description: "Author and lint Agent Skills with validation, activation, and implementation axes.",
    tags: ["anthropic", "authoring"],
    qualityScore: 92,
  },
] as const;

const MEMORY_NODES = [
  { externalId: "mc/architecture", label: "Mission Control Architecture", fileType: "md" },
  { externalId: "mc/factory-loop", label: "Software Factory Loop", fileType: "md" },
  { externalId: "mc/registry-cdl", label: "Context CDL Lifecycle", fileType: "md" },
  { externalId: "mc/harness-patterns", label: "Harness AI Patterns", fileType: "md" },
  { externalId: "mc/merge-gates", label: "Merge Gate Policy", fileType: "md" },
  { externalId: "mc/agent-fleet", label: "Agent Fleet Topology", fileType: "md" },
  { externalId: "mc/eval-scenarios", label: "Eval Scenario Library", fileType: "md" },
  { externalId: "mc/incident-runbook", label: "Incident Response Runbook", fileType: "md" },
  { externalId: "mc/cost-attribution", label: "Cost Attribution Model", fileType: "md" },
] as const;

function hashForIndex(index: number): string {
  const hex = index.toString(16).padStart(2, "0");
  return `sha256:${hex.repeat(32).slice(0, 64)}`;
}

async function ensureWorkflow(ctx: any, workflowId: string, name: string, now: number) {
  const existing = await ctx.db
    .query("workflows")
    .withIndex("by_workflow_id", (q: any) => q.eq("workflowId", workflowId))
    .first();
  if (existing) return existing;

  const id = await ctx.db.insert("workflows", {
    workflowId,
    name,
    description: `Seeded workflow for ${name}`,
    agents: [{ id: "hermes", persona: "operator-orchestrator" }],
    steps: [
      { id: "plan", agent: "hermes", input: "Plan work", expects: "Scoped plan", retryLimit: 1, timeoutMinutes: 15 },
      { id: "execute", agent: "hermes", input: "Execute", expects: "Artifacts", retryLimit: 2, timeoutMinutes: 30 },
      { id: "verify", agent: "hermes", input: "Verify", expects: "Receipts", retryLimit: 1, timeoutMinutes: 20 },
    ],
    active: true,
    version: 1,
    createdBy: "seedMissionControlDemo",
    createdAt: now,
    updatedAt: now,
    metadata: { seedTag: "mc-demo" },
  });
  return await ctx.db.get(id);
}

export async function seedDemoExtensions(ctx: any, input: DemoSeedContext) {
  const { tenantId, projectId, now, withSeedMeta } = input;
  const counts = {
    contextPackages: 0,
    knowledgeGraphNodes: 0,
    workOrders: 0,
    goals: 0,
    harnessPrChecks: 0,
    metaLoopSuggestions: 0,
    contextEvalRuns: 0,
    contextInstallations: 0,
    alerts: 0,
  };

  const agents = await ctx.db
    .query("agents")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const leadAgent = agents.find((a: any) => a.role === "LEAD" || a.role === "CEO") ?? agents[0];

  const packageIds: Id<"contextPackages">[] = [];
  const versionByPackage = new Map<string, Id<"contextPackageVersions">>();

  for (let i = 0; i < SKILL_PACKAGES.length; i++) {
    const spec = SKILL_PACKAGES[i];
    let pkg = await ctx.db
      .query("contextPackages")
      .withIndex("by_slug", (q: any) => q.eq("slug", spec.slug))
      .first();

    if (!pkg) {
      const packageId = await ctx.db.insert("contextPackages", {
        name: spec.name,
        slug: spec.slug,
        displayName: spec.displayName,
        description: spec.description,
        type: "SKILL",
        status: "DRAFT",
        owner: "mission-control-demo",
        tags: [...spec.tags],
        riskLevel: "GREEN",
        projectId,
        tenantId,
        createdAt: now - i * 3_600_000,
        updatedAt: now - i * 3_600_000,
      });
      pkg = await ctx.db.get(packageId);
      counts.contextPackages++;
    }

    packageIds.push(pkg!._id);

    const existingVersion = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package_version", (q: any) => q.eq("packageId", pkg!._id).eq("version", "1.0.0"))
      .first();

    let versionId = existingVersion?._id;
    if (!existingVersion) {
      versionId = await ctx.db.insert("contextPackageVersions", {
        packageId: pkg!._id,
        version: "1.0.0",
        status: "PUBLISHED",
        contentHash: hashForIndex(i + 1),
        inlineContent: `# ${spec.displayName}\n\n${spec.description}\n\n## Usage\n\nLoad via registry discover or mc context install.`,
        manifestVersion: "1",
        sourceRepo: REPO_SLUG,
        sourcePath: `.claude/skills/${spec.name}/SKILL.md`,
        qualityScore: spec.qualityScore,
        reviewAxes: {
          validation: spec.qualityScore - 2,
          implementation: spec.qualityScore - 4,
          activation: spec.qualityScore,
        },
        securityStatus: "PASS",
        publishedAt: now - i * 3_600_000,
        createdAt: now - i * 3_600_000,
      });
    }

    versionByPackage.set(spec.slug, versionId!);
    if (!pkg!.currentVersionId) {
      await ctx.db.patch(pkg!._id, {
        status: "PUBLISHED",
        currentVersionId: versionId,
        updatedAt: now,
      });
    }

    const existingScenario = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package", (q: any) => q.eq("packageId", pkg!._id))
      .first();
    if (!existingScenario) {
      await ctx.db.insert("contextEvalScenarios", {
        packageId: pkg!._id,
        name: `${spec.displayName} baseline`,
        description: `Baseline eval for ${spec.slug}`,
        taskPrompt: `Apply ${spec.displayName} to a representative Mission Control task.`,
        criteria: [
          { id: "structure", label: "Follows skill structure", weight: 0.4 },
          { id: "outcome", label: "Produces expected outcome", weight: 0.6 },
        ],
        active: true,
        projectId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const manifest = await ctx.db
    .query("contextManifests")
    .withIndex("by_repo", (q: any) => q.eq("repoSlug", REPO_SLUG))
    .first();
  if (!manifest) {
    await ctx.db.insert("contextManifests", {
      repoSlug: REPO_SLUG,
      manifestJson: JSON.stringify({
        schemaVersion: "1",
        packages: SKILL_PACKAGES.map((p) => ({ slug: p.slug, version: "1.0.0" })),
      }),
      schemaVersion: "1",
      updatedBy: "seedMissionControlDemo",
      createdAt: now,
      updatedAt: now,
    });
  }

  for (let i = 0; i < SKILL_PACKAGES.length; i++) {
    const spec = SKILL_PACKAGES[i];
    const versionId = versionByPackage.get(spec.slug);
    const existingInstall = await ctx.db
      .query("contextInstallations")
      .withIndex("by_repo_package", (q: any) =>
        q.eq("repoSlug", REPO_SLUG).eq("packageSlug", spec.slug)
      )
      .first();
    if (!existingInstall) {
      await ctx.db.insert("contextInstallations", {
        repoSlug: REPO_SLUG,
        packageSlug: spec.slug,
        versionId,
        version: "1.0.0",
        contentHash: hashForIndex(i + 1),
        state: i % 5 === 0 ? "STALE" : "INSTALLED",
        createdAt: now,
        updatedAt: now,
      });
      counts.contextInstallations++;
    }
  }

  for (let i = 0; i < 12; i++) {
    const pkg = packageIds[i % packageIds.length];
    const versionId = versionByPackage.get(SKILL_PACKAGES[i % SKILL_PACKAGES.length].slug)!;
    const idempotencyKey = `mc-demo:eval-run:${i + 1}`;
    const existingRun = await ctx.db
      .query("contextEvalRuns")
      .withIndex("by_package", (q: any) => q.eq("packageId", pkg))
      .collect();
    if (existingRun.some((r: any) => r.idempotencyKey === idempotencyKey)) continue;

    const status = i % 4 === 0 ? "RUNNING" : i % 7 === 0 ? "FAILED" : "COMPLETED";
    await ctx.db.insert("contextEvalRuns", {
      packageId: pkg,
      versionId,
      status,
      scenarioCount: 2,
      completedScenarios: status === "COMPLETED" ? 2 : status === "RUNNING" ? 1 : 0,
      baselineScore: 72 + (i % 8),
      candidateScore: status === "FAILED" ? 68 + (i % 5) : 80 + (i % 10),
      impactScore: 75 + (i % 12),
      impactDelta: status === "FAILED" ? -4 : 6 + (i % 5),
      idempotencyKey,
      actorId: "seedMissionControlDemo",
      projectId,
      errorMessage: status === "FAILED" ? "Scenario timeout during candidate run" : undefined,
      startedAt: now - (i + 1) * 45 * 60_000,
      completedAt: status === "COMPLETED" ? now - i * 30 * 60_000 : undefined,
      createdAt: now - (i + 1) * 45 * 60_000,
    });
    counts.contextEvalRuns++;
  }

  for (let i = 0; i < MEMORY_NODES.length; i++) {
    const node = MEMORY_NODES[i];
    const existing = await ctx.db
      .query("knowledgeGraphNodes")
      .withIndex("by_external", (q: any) =>
        q.eq("source", "mission-control").eq("externalId", node.externalId)
      )
      .first();
    if (existing) continue;

    await ctx.db.insert("knowledgeGraphNodes", {
      projectId,
      source: "mission-control",
      externalId: node.externalId,
      label: node.label,
      fileType: node.fileType,
      sourceFile: `docs/memory/${node.externalId}.md`,
      community: i % 3,
      metadata: withSeedMeta(`kg-node:${node.externalId}`),
      importedAt: now - i * 86_400_000,
    });
    counts.knowledgeGraphNodes++;
  }

  for (let i = 0; i < MEMORY_NODES.length - 1; i++) {
    const from = MEMORY_NODES[i].externalId;
    const to = MEMORY_NODES[i + 1].externalId;
    const externalId = `edge:${from}->${to}`;
    const existing = await ctx.db
      .query("knowledgeGraphEdges")
      .withIndex("by_from", (q: any) =>
        q.eq("source", "mission-control").eq("fromExternalId", from)
      )
      .collect();
    if (existing.some((row: any) => row.toExternalId === to)) continue;

    await ctx.db.insert("knowledgeGraphEdges", {
      projectId,
      source: "mission-control",
      externalId,
      fromExternalId: from,
      toExternalId: to,
      relation: "references",
      confidence: "high",
      confidenceScore: 0.85,
      weight: 1,
      sourceFile: `docs/memory/${from}.md`,
      importedAt: now - i * 86_400_000,
    });
  }

  await ensureWorkflow(ctx, "mc-demo-delivery", "MC Demo Delivery", now);

  const workOrderSpecs = [
    {
      key: "registry-eval-gate",
      title: "Wire eval framework gate on registry publish",
      state: "IN_PROGRESS" as const,
      riskLevel: "MEDIUM" as const,
      approvalStatus: "APPROVED" as const,
    },
    {
      key: "harness-pr-checks",
      title: "Seed harness PR checks for change review wizard",
      state: "AWAITING_VERIFICATION" as const,
      riskLevel: "LOW" as const,
      approvalStatus: "NOT_REQUIRED" as const,
    },
    {
      key: "eos-command-center",
      title: "Populate EOS Command Center with live projections",
      state: "READY" as const,
      riskLevel: "LOW" as const,
      approvalStatus: "NOT_REQUIRED" as const,
    },
    {
      key: "context-cdl-sync",
      title: "Reconcile context CDL installs across repos",
      state: "BLOCKED" as const,
      riskLevel: "HIGH" as const,
      approvalStatus: "PENDING" as const,
    },
    {
      key: "factory-health-metrics",
      title: "Expose human-touch and token spend factory KPIs",
      state: "IN_PROGRESS" as const,
      riskLevel: "MEDIUM" as const,
      approvalStatus: "APPROVED" as const,
    },
    {
      key: "incident-triage",
      title: "Reduce open incident MTTR on telemetry stream",
      state: "AWAITING_APPROVAL" as const,
      riskLevel: "CRITICAL" as const,
      approvalStatus: "PENDING" as const,
    },
    {
      key: "memory-graph-import",
      title: "Import Agentic-KB graph overlay into Memory pillars",
      state: "READY" as const,
      riskLevel: "LOW" as const,
      approvalStatus: "NOT_REQUIRED" as const,
    },
    {
      key: "cost-attribution-v2",
      title: "Attribute run cost to work orders and missions",
      state: "IN_PROGRESS" as const,
      riskLevel: "MEDIUM" as const,
      approvalStatus: "CONDITIONAL" as const,
    },
  ];

  for (let i = 0; i < workOrderSpecs.length; i++) {
    const spec = workOrderSpecs[i];
    const idempotencyKey = `mc-demo:work-order:${spec.key}`;
    const existing = await ctx.db
      .query("workOrders")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) continue;

    const acceptanceCriteria = [
      {
        id: "ac-visible",
        title: "Visible in Work Orders read model",
        verificationMethod: "CHECKLIST" as const,
        status: i % 3 === 0 ? ("PASS" as const) : ("PENDING" as const),
      },
      {
        id: "ac-evidence",
        title: "Receipt evidence attached",
        verificationMethod: "TEST" as const,
        status: i % 4 === 0 ? ("PASS" as const) : ("PENDING" as const),
      },
    ];

    await ctx.db.insert("workOrders", {
      tenantId,
      projectId,
      idempotencyKey,
      title: spec.title,
      desiredOutcome: spec.title,
      context: `Seeded work order for EOS demo coverage (${spec.key}).`,
      workflowId: "mc-demo-delivery",
      repository: REPO_SLUG,
      branchStrategy: "feature/mc-demo",
      priority: ((i % 4) + 1) as 1 | 2 | 3 | 4,
      riskLevel: spec.riskLevel,
      requestedBy: "Jay West",
      assignedAgent: "Hermes",
      assignedSquad: "Mission Control",
      acceptanceCriteria,
      constraints: ["Demo seed only", "No external writeback"],
      sourceOfTruthRefs: [{ kind: "REPO", label: "MissionControl", location: REPO_SLUG }],
      state: spec.state,
      verificationStatus: deriveVerificationStatus(acceptanceCriteria),
      approvalStatus: spec.approvalStatus,
      blockingIssue: spec.state === "BLOCKED" ? "Waiting on registry lock reconciliation" : undefined,
      currentRevisionNumber: 1,
      createdAt: now - i * 90 * 60_000,
      updatedAt: now - i * 60 * 60_000,
      metadata: withSeedMeta(`work-order:${spec.key}`),
    });
    counts.workOrders++;
  }

  const companyGoals = [
    { title: "Ship EOS Command Center GA", level: "COMPANY" as const, status: "ACTIVE" as const, progressPct: 68 },
    { title: "Reduce agent cost per verified outcome 20%", level: "COMPANY" as const, status: "ACTIVE" as const, progressPct: 42 },
  ];
  const teamGoals = [
    { title: "Registry CDL fully wired", level: "TEAM" as const, status: "ACTIVE" as const, progressPct: 75 },
    { title: "Harness merge gates on every PR", level: "TEAM" as const, status: "PLANNED" as const, progressPct: 30 },
    { title: "104-incident telemetry baseline", level: "TEAM" as const, status: "ACTIVE" as const, progressPct: 88 },
  ];

  const parentIds = new Map<string, Id<"goals">>();
  for (const spec of [...companyGoals, ...teamGoals]) {
    const seedKey = `goal:${spec.level}:${slugify(spec.title)}`;
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
      .collect();
    if (existing.some((g: any) => g.metadata?.seedKey === seedKey)) continue;

    const goalId = await ctx.db.insert("goals", {
      tenantId,
      projectId,
      title: spec.title,
      description: `Seeded ${spec.level.toLowerCase()} objective for demo`,
      level: spec.level,
      parentGoalId: spec.level === "TEAM" ? parentIds.get("company") : undefined,
      ownerAgentId: leadAgent?._id,
      status: spec.status,
      progressPct: spec.progressPct,
      targetDate: now + 90 * 86_400_000,
      metadata: withSeedMeta(seedKey),
    });
    if (spec.level === "COMPANY" && !parentIds.has("company")) {
      parentIds.set("company", goalId);
    }
    counts.goals++;
  }

  for (let i = 0; i < agents.length && i < 6; i++) {
    const agent = agents[i];
    const seedKey = `goal:agent:${agent._id}`;
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_owner_agent", (q: any) => q.eq("ownerAgentId", agent._id))
      .collect();
    if (existing.some((g: any) => g.metadata?.seedKey === seedKey)) continue;

    await ctx.db.insert("goals", {
      tenantId,
      projectId,
      title: `${agent.name} — weekly verified outcomes`,
      level: "AGENT",
      parentGoalId: parentIds.get("company"),
      ownerAgentId: agent._id,
      status: i % 4 === 0 ? "ACHIEVED" : "ACTIVE",
      progressPct: 40 + (i % 6) * 10,
      metadata: withSeedMeta(seedKey),
    });
    counts.goals++;
  }

  for (let i = 0; i < 6; i++) {
    const prNumber = 200 + i;
    const existing = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_pr_url", (q: any) =>
        q.eq("prUrl", `https://github.com/${REPO_SLUG}/pull/${prNumber}`)
      )
      .first();
    if (existing) continue;

    await ctx.db.insert("harnessPrChecks", {
      projectId,
      prUrl: `https://github.com/${REPO_SLUG}/pull/${prNumber}`,
      prNumber,
      repoFullName: REPO_SLUG,
      branch: `feature/demo-${i + 1}`,
      title: `Demo PR ${prNumber}: ${SKILL_PACKAGES[i % SKILL_PACKAGES.length].displayName}`,
      ciStatus: i % 3 === 0 ? "PENDING" : i % 5 === 0 ? "FAIL" : "PASS",
      ciProvider: "github-actions",
      source: i % 2 === 0 ? "WORKFLOW" : "CODEGEN",
      changeReviewLenses: [
        { id: "security", label: "Security", enabled: true, score: 85 + i },
        { id: "correctness", label: "Correctness", enabled: true, score: 80 + i },
        { id: "style", label: "Style", enabled: i % 2 === 0, score: 90 },
      ],
      mutationTesting:
        i % 2 === 0
          ? {
              diffCoveragePct: 72 + i,
              findings: [
                { id: "m1", mutation: "boundary-null", caught: true, file: "convex/lib/mergeGates.ts" },
                { id: "m2", mutation: "invert-condition", caught: i % 3 !== 0, file: "apps/mission-control-ui/src/harness" },
              ],
            }
          : undefined,
      syncedAt: now - i * 15 * 60_000,
      createdAt: now - i * 15 * 60_000,
      metadata: withSeedMeta(`harness-pr:${prNumber}`),
    });
    counts.harnessPrChecks++;
  }

  const metaSpecs = [
    { kind: "EVAL_SCENARIO" as const, title: "Add eval for context compression regressions" },
    { kind: "VERIFIER" as const, title: "Verifier: registry publish requires lint pass" },
    { kind: "SKILL_UPDATE" as const, title: "Refresh code-review-wizard activation triggers" },
    { kind: "MAINTENANCE" as const, title: "Retire stale demo skills from lock file" },
    { kind: "DELEGATION" as const, title: "Delegate flaky-step analysis to QA agent" },
    { kind: "RULE_RETIRE" as const, title: "Deprecate legacy inline-style cursor rule" },
  ];
  for (let i = 0; i < metaSpecs.length; i++) {
    const spec = metaSpecs[i];
    const existing = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_project_status", (q: any) => q.eq("projectId", projectId).eq("status", "OPEN"))
      .collect();
    if (existing.some((row: any) => row.title === spec.title)) continue;

    await ctx.db.insert("metaLoopSuggestions", {
      projectId,
      kind: spec.kind,
      title: spec.title,
      summary: `Seeded meta-loop suggestion ${i + 1} from factory health review.`,
      status: i % 4 === 0 ? "ACCEPTED" : "OPEN",
      sourceRef: `run:demo-${i + 1}`,
      packageId: packageIds[i % packageIds.length],
      payload: withSeedMeta(`meta-loop:${i + 1}`),
      createdAt: now - i * 20 * 60_000,
    });
    counts.metaLoopSuggestions++;
  }

  for (let i = 0; i < 5; i++) {
    const pkg = packageIds[i];
    const idempotencyKey = `mc-demo:verifier:${i + 1}`;
    const existing = await ctx.db
      .query("contextVerifiers")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) continue;

    await ctx.db.insert("contextVerifiers", {
      packageId: pkg,
      projectId,
      label: `Verifier ${i + 1}: ${SKILL_PACKAGES[i].displayName}`,
      invariant: "Published packages must pass skill lint and eval gate",
      globPatterns: ["**/*.ts", "**/SKILL.md"],
      active: true,
      passRate: 0.88 + i * 0.02,
      lastRunAt: now - i * 60 * 60_000,
      validatedModel: "claude-sonnet-4",
      sourceSkillId: pkg,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .take(80);
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .take(80);

  const existingAlerts = await ctx.db
    .query("alerts")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();
  const existingAlertKeys = new Set(
    existingAlerts
      .map((row: any) => row.metadata?.seedKey)
      .filter(Boolean)
  );

  for (let i = 0; i < 76; i++) {
    const idempotencyKey = `mc-demo:alert:extra:${i + 1}`;
    if (existingAlertKeys.has(idempotencyKey)) continue;

    const agent = agents[i % agents.length];
    const task = tasks[i % tasks.length];
    const run = runs[i % runs.length];
    const status = i % 5 === 0 ? "OPEN" : i % 5 === 1 ? "ACKNOWLEDGED" : i % 5 === 2 ? "RESOLVED" : "IGNORED";

    await ctx.db.insert("alerts", {
      tenantId,
      projectId,
      severity: i % 12 === 0 ? "CRITICAL" : i % 7 === 0 ? "ERROR" : i % 3 === 0 ? "WARNING" : "INFO",
      type: i % 2 === 0 ? "RUNTIME_EVENT" : "POLICY_EVENT",
      title: `Incident ${i + 29}: ${i % 2 === 0 ? "Runtime anomaly" : "Policy gate triggered"}`,
      description: `Extended demo alert ${i + 29} for Incidents view density`,
      agentId: agent?._id,
      taskId: task?._id,
      runId: run?._id,
      status,
      acknowledgedBy: status === "ACKNOWLEDGED" ? "operator" : undefined,
      acknowledgedAt: status === "ACKNOWLEDGED" ? now - i * 4 * 60_000 : undefined,
      resolvedAt: status === "RESOLVED" ? now - i * 6 * 60_000 : undefined,
      resolutionNote: status === "RESOLVED" ? "Mitigated and monitored" : undefined,
      metadata: withSeedMeta(idempotencyKey),
    });
    counts.alerts++;
  }

  const demoFlags = [
    "ui.shell.v2",
    "context.registry",
    "delivery.workorders",
    "eos.command-center-preview",
    "executor.pi-bridge",
    "eval.framework",
  ];
  for (const key of demoFlags) {
    const rows = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .collect();
    const existing = rows.find((row: { projectId?: string }) => row.projectId == null);
    if (!existing) {
      await ctx.db.insert("featureFlags", {
        key,
        enabled: true,
        description: `Demo seed — ${key}`,
        createdAt: now,
        updatedAt: now,
        updatedBy: "seedMissionControlDemo",
      });
    }
  }

  return counts;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
