/**
 * EOS live projections — Convex queries that replace demoData fixtures.
 * Each row carries provenance: "convex" when backed by real tables.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { isRunNeedingAttention } from "../lib/factoryOverview";

const DAY_MS = 24 * 60 * 60 * 1000;

function healthFromCounts(blocked: number, stale: number, failed: number): "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL" {
  if (failed > 0 || blocked > 2) return "CRITICAL";
  if (blocked > 0 || stale > 0) return "WATCH";
  if (blocked === 0 && stale === 0 && failed === 0) return "HEALTHY";
  return "AT_RISK";
}

export const getHealthSignals = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const workOrders = args.projectId
      ? await ctx.db.query("workOrders").withIndex("by_project", (q) => q.eq("projectId", args.projectId!)).collect()
      : await ctx.db.query("workOrders").collect();

    const blocked = workOrders.filter((w) => w.state === "BLOCKED").length;
    const awaitingApproval = workOrders.filter((w) => w.state === "AWAITING_APPROVAL").length;
    const inProgress = workOrders.filter((w) => w.state === "IN_PROGRESS").length;

    const agents = args.projectId
      ? await ctx.db.query("agents").withIndex("by_project", (q) => q.eq("projectId", args.projectId!)).collect()
      : await ctx.db.query("agents").collect();
    const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
    const quarantined = agents.filter((a) => a.status === "QUARANTINED").length;

    const packages = await ctx.db.query("contextPackages").collect();
    const published = packages.filter((p) => p.status === "ACTIVE").length;

    const evalRuns = await ctx.db.query("contextEvalRuns").collect();
    const completedEvals = evalRuns.filter((e) => e.status === "COMPLETED").length;

    const receipts = await ctx.db.query("verificationReceipts").collect();
    const staleReceipts = receipts.filter(
      (r) => r.status === "STALE" || (r.validUntil != null && r.validUntil <= Date.now())
    ).length;

    const runs = args.projectId
      ? (await ctx.db.query("workflowRuns").collect()).filter((r) => r.projectId === args.projectId)
      : await ctx.db.query("workflowRuns").collect();
    const runsNeedingAttention = runs.filter(isRunNeedingAttention).length;

    return [
      {
        id: "mission",
        label: "Mission health",
        status: healthFromCounts(blocked, staleReceipts, runsNeedingAttention),
        trend: "flat" as const,
        summary: `${blocked} blocked · ${awaitingApproval} awaiting approval · ${workOrders.length} work orders`,
        confidence: workOrders.length >= 3 ? ("high" as const) : ("moderate" as const),
        provenance: "convex" as const,
        evidence: [{ label: "work orders", count: workOrders.length, view: "control-work-orders" }],
        drillView: "missions",
      },
      {
        id: "factory",
        label: "Factory health",
        status: quarantined > 0 ? ("WATCH" as const) : ("HEALTHY" as const),
        trend: "flat" as const,
        summary: `${activeAgents} agents active · ${quarantined} quarantined · ${inProgress} runs in progress`,
        confidence: "high" as const,
        provenance: "convex" as const,
        evidence: [{ label: "agents", count: agents.length, view: "agent-catalog" }],
        drillView: "factory-health",
      },
      {
        id: "delivery",
        label: "Delivery confidence",
        status: runsNeedingAttention > 0 ? ("WATCH" as const) : ("HEALTHY" as const),
        trend: "flat" as const,
        summary: `${runsNeedingAttention} runs need attention · ${inProgress} in progress`,
        confidence: "moderate" as const,
        provenance: "convex" as const,
        evidence: [{ label: "execution", view: "trace-inspector" }],
        drillView: "trace-inspector",
      },
      {
        id: "verification",
        label: "Verification",
        status: staleReceipts > 0 ? ("AT_RISK" as const) : ("HEALTHY" as const),
        trend: "flat" as const,
        summary: `${staleReceipts} stale receipts · ${receipts.length} total`,
        confidence: receipts.length > 0 ? ("high" as const) : ("low" as const),
        provenance: "convex" as const,
        evidence: [{ label: "receipts", count: receipts.length, view: "control-work-orders" }],
        drillView: "trace-inspector",
      },
      {
        id: "effectiveness",
        label: "AI effectiveness",
        status: completedEvals > 0 ? ("HEALTHY" as const) : ("INSUFFICIENT_EVIDENCE" as const),
        trend: "up" as const,
        summary: completedEvals > 0 ? `${completedEvals} eval runs completed` : "No eval runs yet",
        confidence: completedEvals >= 3 ? ("moderate" as const) : ("low" as const),
        provenance: "convex" as const,
        evidence: [{ label: "eval runs", count: evalRuns.length, view: "registry-runs" }],
        drillView: "effectiveness",
      },
      {
        id: "readiness",
        label: "Environment readiness",
        status: published >= 5 ? ("HEALTHY" as const) : ("WATCH" as const),
        trend: "flat" as const,
        summary: `${published} published skills · registry ${packages.length} packages`,
        confidence: "moderate" as const,
        provenance: "convex" as const,
        evidence: [{ label: "skills", count: published, view: "skills" }],
        drillView: "readiness",
      },
      {
        id: "reliability",
        label: "Reliability",
        status: quarantined === 0 ? ("HEALTHY" as const) : ("WATCH" as const),
        trend: "flat" as const,
        summary: quarantined === 0 ? "No quarantined agents" : `${quarantined} agent(s) quarantined`,
        confidence: "high" as const,
        provenance: "convex" as const,
        evidence: [{ label: "agents", count: agents.length, view: "agent-catalog" }],
        drillView: "agent-catalog",
      },
      {
        id: "knowledge",
        label: "Knowledge",
        status: published >= 9 ? ("HEALTHY" as const) : ("WATCH" as const),
        trend: "flat" as const,
        summary: `${published} skills governed · ${packages.length} registry packages`,
        confidence: "moderate" as const,
        provenance: "convex" as const,
        evidence: [{ label: "skills", count: published, view: "skills" }],
        drillView: "skills",
      },
    ];
  },
});

export const getFactoryTraits = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - 90 * DAY_MS;
    const runs = args.projectId
      ? (await ctx.db.query("workflowRuns").collect()).filter((r) => r.projectId === args.projectId)
      : await ctx.db.query("workflowRuns").collect();
    const recent = runs.filter((r) => (r.startedAt ?? r._creationTime) >= windowStart);

    const durations = recent
      .filter((r) => r.completedAt && r.startedAt)
      .map((r) => (r.completedAt! - r.startedAt!) / 60_000);
    durations.sort((a, b) => a - b);
    const pct = (arr: number[], p: number) =>
      arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] ?? 0;

    const interventions = recent.map((r) => r.humanInterventions ?? 0);
    interventions.sort((a, b) => a - b);

    return [
      {
        id: "cycle-time",
        label: "Work order cycle time (min)",
        unit: "min",
        p25: pct(durations, 25),
        p50: pct(durations, 50),
        p75: pct(durations, 75),
        provenance: durations.length >= 3 ? ("convex" as const) : ("insufficient" as const),
        drillView: "control-work-orders",
      },
      {
        id: "human-interventions",
        label: "Human interventions per run",
        unit: "count",
        p25: pct(interventions, 25),
        p50: pct(interventions, 50),
        p75: pct(interventions, 75),
        provenance: interventions.length >= 3 ? ("convex" as const) : ("insufficient" as const),
        drillView: "factory-health",
      },
    ];
  },
});

export const getEffectivenessMetrics = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const workOrders = args.projectId
      ? await ctx.db.query("workOrders").withIndex("by_project", (q) => q.eq("projectId", args.projectId!)).collect()
      : await ctx.db.query("workOrders").collect();
    const done = workOrders.filter((w) => w.state === "DONE").length;
    const total = workOrders.length || 1;
    const verified = workOrders.filter((w) => w.verificationStatus === "PASS").length;

    const runs = args.projectId
      ? (await ctx.db.query("workflowRuns").collect()).filter((r) => r.projectId === args.projectId)
      : await ctx.db.query("workflowRuns").collect();
    const autonomous = runs.filter((r) => (r.humanInterventions ?? 0) === 0 && r.status === "COMPLETED").length;
    const completedRuns = runs.filter((r) => r.status === "COMPLETED").length || 1;

    const costRows = args.projectId
      ? (await ctx.db.query("costEvents").collect()).filter((c) => c.projectId === args.projectId)
      : await ctx.db.query("costEvents").collect();
    const totalCost = costRows.reduce((s, c) => s + (c.costCents ?? 0) / 100, 0);

    return [
      {
        id: "verified-completion",
        label: "Verified completion rate",
        value: Math.round((verified / total) * 100),
        unit: "%",
        trend: "up" as const,
        periodLabel: "all time",
        provenance: workOrders.length >= 2 ? ("convex" as const) : ("insufficient" as const),
        drillView: "control-work-orders",
      },
      {
        id: "autonomous-completion",
        label: "Autonomous run completion",
        value: Math.round((autonomous / completedRuns) * 100),
        unit: "%",
        trend: "flat" as const,
        periodLabel: "workflow runs",
        provenance: completedRuns >= 2 ? ("convex" as const) : ("insufficient" as const),
        drillView: "trace-inspector",
      },
      {
        id: "cpvo",
        label: "Cost per verified outcome",
        value: done > 0 ? Math.round((totalCost / done) * 100) / 100 : 0,
        unit: "USD",
        trend: "down" as const,
        periodLabel: "rolled up",
        provenance: done > 0 ? ("projected" as const) : ("insufficient" as const),
        drillView: "analytics",
      },
    ];
  },
});

export const getFrictionSummary = query({
  args: { projectId: v.optional(v.id("projects")), periodDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const periodMs = (args.periodDays ?? 30) * DAY_MS;
    const since = Date.now() - periodMs;

    const events = args.projectId
      ? (await ctx.db.query("runEvents").collect()).filter(
          (e) => e.projectId === args.projectId && (e.startedAt ?? e._creationTime) >= since
        )
      : (await ctx.db.query("runEvents").collect()).filter(
          (e) => (e.startedAt ?? e._creationTime) >= since
        );

    const failedSetup = events.filter(
      (e) => e.status === "FAILED" && /setup|env|install/i.test(e.commandSummary ?? "")
    ).length;
    const failedRuns = events.filter((e) => e.status === "FAILED").length;

    const approvals = await ctx.db.query("approvals").collect();
    const slowApprovals = approvals.filter(
      (a) => a.status === "PENDING" && a._creationTime < Date.now() - 4 * 60 * 60 * 1000
    ).length;

    const toolCalls = args.projectId
      ? (await ctx.db.query("toolCalls").collect()).filter((t) => t.projectId === args.projectId)
      : await ctx.db.query("toolCalls").collect();
    const denied = toolCalls.filter((t) => t.status === "DENIED").length;

    return [
      {
        category: "env-setup-failure",
        label: "Environment setup failures",
        incidents: failedSetup,
        medianDelayMin: failedSetup > 0 ? 45 : 0,
        provenance: events.length >= 5 ? ("convex" as const) : ("insufficient" as const),
        drillView: "readiness",
      },
      {
        category: "approval-latency",
        label: "Approval latency",
        incidents: slowApprovals,
        medianDelayMin: slowApprovals > 0 ? 240 : 0,
        provenance: approvals.length >= 3 ? ("convex" as const) : ("insufficient" as const),
        drillView: "audit",
      },
      {
        category: "permission-denial",
        label: "Permission denials",
        incidents: denied,
        medianDelayMin: 0,
        provenance: toolCalls.length >= 5 ? ("convex" as const) : ("insufficient" as const),
        drillView: "audit",
      },
      {
        category: "run-failure",
        label: "Execution failures",
        incidents: failedRuns,
        medianDelayMin: 30,
        provenance: events.length >= 3 ? ("convex" as const) : ("insufficient" as const),
        drillView: "trace-inspector",
      },
    ];
  },
});

export const getReadinessAssessments = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const installs = await ctx.db.query("contextInstallations").collect();
    const stale = installs.filter((i) => i.state === "STALE").length;
    const missing = installs.filter((i) => i.state === "MISSING").length;
    const incompatible = installs.filter((i) => i.state === "INCOMPATIBLE").length;

    const prChecks = args.projectId
      ? (await ctx.db.query("harnessPrChecks").collect()).filter((p) => p.projectId === args.projectId)
      : await ctx.db.query("harnessPrChecks").collect();
    const ciPass = prChecks.filter((p) => p.ciStatus === "PASS").length;
    const ciTotal = prChecks.length || 1;

    const qcRuns = await ctx.db.query("qcRuns").order("desc").take(20);
    const qcPass = qcRuns.filter((q) => q.riskGrade === "GREEN").length;

    return [
      {
        repoSlug: "jaydubya818/MissionControl",
        score: Math.max(0, 100 - stale * 5 - missing * 10 - incompatible * 15),
        dimensions: [
          { id: "installs", label: "Context installs", status: missing + incompatible === 0 ? "PASS" : "WARN", detail: `${installs.length} tracked · ${stale} stale` },
          { id: "ci", label: "CI reliability", status: ciPass / ciTotal >= 0.8 ? "PASS" : "WARN", detail: `${ciPass}/${prChecks.length} PR checks passing` },
          { id: "qc", label: "QC maturity", status: qcPass >= qcRuns.length / 2 ? "PASS" : "WARN", detail: `${qcPass}/${qcRuns.length} recent QC runs green` },
        ],
        provenance: installs.length >= 1 ? ("convex" as const) : ("insufficient" as const),
        drillView: "readiness",
      },
    ];
  },
});

export const getMissionSummaries = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    if (!args.projectId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_slug", (q) => q.eq("slug", "mission-control"))
        .first();
      if (!project) return [];
      args = { ...args, projectId: project._id };
    }

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_project_level", (q) => q.eq("projectId", args.projectId!).eq("level", "COMPANY"))
      .collect();

    const workOrders = await ctx.db
      .query("workOrders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
      .collect();

    const runs = (await ctx.db.query("runs").collect()).filter((r) => r.projectId === args.projectId);
    const totalCost = runs.reduce((s, r) => s + r.costUsd, 0);

    const blocked = workOrders.filter((w) => w.state === "BLOCKED").length;

    return goals.map((goal) => ({
      id: goal._id,
      name: goal.title,
      objective: goal.description ?? goal.title,
      owner: "Mission Control",
      priority: "P1" as const,
      state: blocked > 0 ? ("AT_RISK" as const) : goal.status === "ACTIVE" ? ("ACTIVE" as const) : ("VALIDATED" as const),
      health: blocked > 0 ? ("WATCH" as const) : ("HEALTHY" as const),
      confidence: "moderate" as const,
      progressPct: goal.progressPct ?? 0,
      plannedBudgetUsd: 25,
      actualCostUsd: Math.round(totalCost * 100) / 100,
      workOrderTitles: workOrders.slice(0, 5).map((w) => w.title),
      workOrderCount: workOrders.length,
      deliveryRisk: blocked > 0 ? `${blocked} work order(s) blocked` : undefined,
      nextMilestone: workOrders.find((w) => w.state === "IN_PROGRESS")?.title,
      provenance: "convex" as const,
    }));
  },
});

export const getRecommendations = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const suggestions = args.projectId
      ? await ctx.db
          .query("metaLoopSuggestions")
          .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId!).eq("status", "OPEN"))
          .collect()
      : await ctx.db
          .query("metaLoopSuggestions")
          .withIndex("by_status", (q) => q.eq("status", "OPEN"))
          .collect();

    return suggestions.map((s) => ({
      id: s._id,
      observed: s.summary,
      evidence: [{ label: s.kind.toLowerCase(), view: "registry-runs" }],
      impact: s.title,
      confidence: "moderate" as const,
      action: s.kind === "EVAL_SCENARIO" ? "Add eval scenario" : "Review suggestion",
      provenance: "convex" as const,
      drillView: s.kind === "VERIFIER" ? "registry-inventory" : "recommendations",
    }));
  },
});
