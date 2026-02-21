/**
 * QC Runs — Convex Functions
 * 
 * Quality Control run lifecycle and execution.
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { appendOpEvent, appendChangeRecord } from "./lib/armAudit";

// ============================================================================
// TYPES
// ============================================================================

interface QCEvidencePack {
  schemaVersion: string;
  producer: string;
  runId: string;
  repoUrl: string;
  commitSha: string;
  timestamp: string;
  docsIndex: { path: string; type: string; lastModified: string }[];
  requirementTraceability: {
    requirementId: string;
    requirementText: string;
    sourceDoc: string;
    implementationFiles: { path: string; lineRange?: [number, number] }[];
    testFiles: { path: string; lineRange?: [number, number] }[];
    evidence: string;
    status: "COVERED" | "PARTIAL" | "MISSING" | "UNTESTABLE";
  }[];
  findings: {
    severity: "RED" | "YELLOW" | "GREEN" | "INFO";
    category: string;
    title: string;
    description: string;
    filePaths?: string[];
    lineRanges?: { file: string; start: number; end: number }[];
    prdRefs?: string[];
    suggestedFix?: string;
    confidence: number;
  }[];
  coverageSummary: {
    unit: { covered: number; total: number; percentage: number };
    integration: { covered: number; total: number; percentage: number };
    e2e: { covered: number; total: number; percentage: number };
    missingAreas: string[];
  };
  deliveryGates: {
    name: string;
    passed: boolean;
    rationale: string;
    severity: "RED" | "YELLOW" | "GREEN";
  }[];
  riskGrade: "GREEN" | "YELLOW" | "RED";
  qualityScore: number;
  policyNotes: string[];
  summary: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateRunId(): string {
  return `QC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

async function computeEvidenceHash(evidencePack: QCEvidencePack): Promise<string> {
  // Use Web Crypto API (available in Convex actions)
  const json = JSON.stringify(evidencePack);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function computeRiskGrade(gates: QCEvidencePack["deliveryGates"]): "GREEN" | "YELLOW" | "RED" {
  // Deterministic: any RED gate fail -> RED, any YELLOW gate fail -> YELLOW, else GREEN
  const hasRedFail = gates.some((g) => g.severity === "RED" && !g.passed);
  if (hasRedFail) return "RED";
  
  const hasYellowFail = gates.some((g) => g.severity === "YELLOW" && !g.passed);
  if (hasYellowFail) return "YELLOW";
  
  return "GREEN";
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List QC runs
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.projectId && args.status) {
      return await ctx.db
        .query("qcRuns")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("status"), args.status))
        .order("desc")
        .take(args.limit ?? 50);
    }
    
    if (args.projectId) {
      return await ctx.db
        .query("qcRuns")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(args.limit ?? 50);
    }
    
    if (args.status) {
      return await ctx.db
        .query("qcRuns")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .take(args.limit ?? 50);
    }
    
    return await ctx.db
      .query("qcRuns")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

/**
 * Get a single QC run
 */
export const get = query({
  args: { id: v.id("qcRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get QC run by runId
 */
export const getByRunId = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("qcRuns")
      .filter((q) => q.eq(q.field("runId"), args.runId))
      .first();
  },
});

/**
 * Get quality score history for sparklines
 */
export const projectScores = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("qcRuns")
      .withIndex("by_project_sequence", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 10);
    
    return runs
      .filter((r) => r.qualityScore !== undefined)
      .map((r) => ({
        runId: r.runId,
        runSequence: r.runSequence,
        qualityScore: r.qualityScore!,
        riskGrade: r.riskGrade,
        completedAt: r.completedAt,
      }));
  },
});

/**
 * Compare two QC runs (diff)
 */
export const diff = query({
  args: {
    runId1: v.id("qcRuns"),
    runId2: v.id("qcRuns"),
  },
  handler: async (ctx, args) => {
    const [run1, run2] = await Promise.all([
      ctx.db.get(args.runId1),
      ctx.db.get(args.runId2),
    ]);
    
    if (!run1 || !run2) {
      throw new Error("One or both runs not found");
    }
    
    // Get findings for both runs
    const [findings1, findings2] = await Promise.all([
      ctx.db
        .query("qcFindings")
        .withIndex("by_run", (q) => q.eq("qcRunId", args.runId1))
        .collect(),
      ctx.db
        .query("qcFindings")
        .withIndex("by_run", (q) => q.eq("qcRunId", args.runId2))
        .collect(),
    ]);
    
    // Compute delta
    const findingCounts1 = run1.findingCounts ?? { red: 0, yellow: 0, green: 0, info: 0 };
    const findingCounts2 = run2.findingCounts ?? { red: 0, yellow: 0, green: 0, info: 0 };
    
    return {
      run1: { runId: run1.runId, runSequence: run1.runSequence, riskGrade: run1.riskGrade, qualityScore: run1.qualityScore },
      run2: { runId: run2.runId, runSequence: run2.runSequence, riskGrade: run2.riskGrade, qualityScore: run2.qualityScore },
      delta: {
        qualityScore: (run2.qualityScore ?? 0) - (run1.qualityScore ?? 0),
        findingCounts: {
          red: findingCounts2.red - findingCounts1.red,
          yellow: findingCounts2.yellow - findingCounts1.yellow,
          green: findingCounts2.green - findingCounts1.green,
          info: findingCounts2.info - findingCounts1.info,
        },
        riskGradeChanged: run1.riskGrade !== run2.riskGrade,
      },
      findings1Count: findings1.length,
      findings2Count: findings2.length,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Start a QC run
 */
export const start = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    repoUrl: v.string(),
    commitSha: v.optional(v.string()),
    branch: v.optional(v.string()),
    scopeType: v.union(
      v.literal("FULL_REPO"),
      v.literal("FILE_LIST"),
      v.literal("DIRECTORY"),
      v.literal("BRANCH_DIFF")
    ),
    scopeSpec: v.optional(v.any()),
    rulesetId: v.optional(v.id("qcRulesets")),
    initiatorType: v.optional(v.union(
      v.literal("HUMAN"),
      v.literal("AGENT"),
      v.literal("SYSTEM"),
      v.literal("WORKFLOW")
    )),
    initiatorId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate scopeType/scopeSpec alignment
    if (args.scopeType === "FULL_REPO") {
      if (args.scopeSpec !== null && args.scopeSpec !== undefined) {
        throw new Error("FULL_REPO requires null or undefined scopeSpec");
      }
    } else if (args.scopeType === "FILE_LIST") {
      if (!Array.isArray(args.scopeSpec)) {
        throw new Error("FILE_LIST requires string[] scopeSpec");
      }
      if (args.scopeSpec.length === 0) {
        throw new Error("FILE_LIST scopeSpec cannot be empty");
      }
    } else if (args.scopeType === "DIRECTORY") {
      if (typeof args.scopeSpec !== "string") {
        throw new Error("DIRECTORY requires string scopeSpec");
      }
      if (args.scopeSpec.trim() === "") {
        throw new Error("DIRECTORY scopeSpec cannot be empty");
      }
    } else if (args.scopeType === "BRANCH_DIFF") {
      if (
        typeof args.scopeSpec !== "object" ||
        args.scopeSpec === null ||
        typeof args.scopeSpec.base !== "string" ||
        typeof args.scopeSpec.head !== "string"
      ) {
        throw new Error("BRANCH_DIFF requires { base: string, head: string } scopeSpec");
      }
      if (args.scopeSpec.base.trim() === "" || args.scopeSpec.head.trim() === "") {
        throw new Error("BRANCH_DIFF base and head cannot be empty");
      }
    }
    
    // Idempotency check
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("qcRuns")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      
      if (existing) {
        return { runId: existing.runId, id: existing._id, created: false };
      }
    }
    
    // Get next runSequence for this project
    let runSequence = 1;
    if (args.projectId) {
      const lastRun = await ctx.db
        .query("qcRuns")
        .withIndex("by_project_sequence", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .first();
      
      if (lastRun) {
        runSequence = lastRun.runSequence + 1;
      }
    }
    
    const now = Date.now();
    const runId = generateRunId();
    
    // Create run
    const id = await ctx.db.insert("qcRuns", {
      tenantId: undefined, // TODO: resolve from project
      projectId: args.projectId,
      runId,
      runSequence,
      status: "PENDING",
      repoUrl: args.repoUrl,
      commitSha: args.commitSha,
      branch: args.branch,
      scopeType: args.scopeType,
      scopeSpec: args.scopeSpec,
      rulesetId: args.rulesetId,
      initiatorType: args.initiatorType ?? "HUMAN",
      initiatorId: args.initiatorId,
      startedAt: now,
      idempotencyKey: args.idempotencyKey,
    });
    
    // Audit log
    await appendChangeRecord(ctx.db as any, {
      tenantId: undefined,
      projectId: args.projectId,
      type: "QC_RUN_CREATED",
      summary: `QC run ${runId} created for ${args.repoUrl}`,
      relatedTable: "qcRuns",
      relatedId: id,
      payload: { runId, repoUrl: args.repoUrl, scopeType: args.scopeType },
    });
    
    await appendOpEvent(ctx.db as any, {
      tenantId: undefined,
      projectId: args.projectId,
      qcRunId: id,
      type: "QC_RUN_STARTED",
      payload: { runId, repoUrl: args.repoUrl },
    });
    
    return { runId, id, created: true };
  },
});

/**
 * Cancel a QC run
 */
export const cancel = mutation({
  args: { id: v.id("qcRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("QC run not found");
    }
    
    if (run.status !== "PENDING" && run.status !== "RUNNING") {
      throw new Error(`Cannot cancel run with status ${run.status}`);
    }
    
    await ctx.db.patch(args.id, {
      status: "CANCELED",
      completedAt: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Complete a QC run (internal)
 */
export const complete = internalMutation({
  args: {
    id: v.id("qcRuns"),
    status: v.union(v.literal("COMPLETED"), v.literal("FAILED")),
    riskGrade: v.optional(v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED"))),
    qualityScore: v.optional(v.number()),
    findingCounts: v.optional(v.object({
      red: v.number(),
      yellow: v.number(),
      green: v.number(),
      info: v.number(),
    })),
    gatePassed: v.optional(v.boolean()),
    evidenceHash: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("QC run not found");
    }
    
    const now = Date.now();
    const durationMs = run.startedAt ? now - run.startedAt : undefined;
    
    await ctx.db.patch(args.id, {
      status: args.status,
      riskGrade: args.riskGrade,
      qualityScore: args.qualityScore,
      findingCounts: args.findingCounts,
      gatePassed: args.gatePassed,
      evidenceHash: args.evidenceHash,
      completedAt: now,
      durationMs,
      metadata: args.error ? { error: args.error } : undefined,
    });
    
    // Emit completion event
    await appendOpEvent(ctx.db as any, {
      tenantId: run.tenantId,
      projectId: run.projectId,
      qcRunId: args.id,
      type: args.status === "COMPLETED" ? "QC_RUN_COMPLETED" : "QC_RUN_FAILED",
      payload: {
        runId: run.runId,
        riskGrade: args.riskGrade,
        qualityScore: args.qualityScore,
        durationMs,
      },
    });
    
    return { success: true };
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Execute QC run (calls AssuranceAgents.AI)
 */
export const execute = action({
  args: {
    id: v.id("qcRuns"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; runId: string; alreadyCompleted?: boolean; riskGrade?: string; qualityScore?: number }> => {
    // Get run
    const run: any = await ctx.runQuery(api.qcRuns.get, { id: args.id });
    if (!run) {
      throw new Error("QC run not found");
    }
    
    // Idempotency: if already completed, return
    if (run.status === "COMPLETED") {
      return { success: true, runId: run.runId, alreadyCompleted: true };
    }
    
    // Transition to RUNNING
    await ctx.runMutation(internal.qcRuns.transitionToRunning, { id: args.id });
    
    try {
      // Get ruleset config
      let rulesetConfig = {
        requiredDocs: ["README.md", "docs/**/*.md"],
        coverageThresholds: { unit: 70, integration: 50, e2e: 30 },
        securityPaths: ["auth/**", "security/**"],
        gateDefinitions: [
          { name: "PRD exists", condition: "requiredDocs", severity: "YELLOW" },
          { name: "Tests exist", condition: "coverageThresholds", severity: "RED" },
        ],
      };
      
      if (run.rulesetId) {
        const ruleset = await ctx.runQuery(api.qcRulesets.get, { id: run.rulesetId });
        if (ruleset) {
          rulesetConfig = {
            requiredDocs: ruleset.requiredDocs,
            coverageThresholds: ruleset.coverageThresholds,
            securityPaths: ruleset.securityPaths,
            gateDefinitions: ruleset.gateDefinitions,
          };
        }
      }
      
      // TODO: Policy evaluation (qc_scan tool, YELLOW risk)
      // For now, proceed without policy check
      
      // Call AssuranceAgents.AI (STUB for v1)
      const evidencePack = await mockAssuranceCall({
        runId: run.runId,
        repoUrl: run.repoUrl,
        commitSha: run.commitSha,
        branch: run.branch,
        scopeType: run.scopeType,
        scopeSpec: run.scopeSpec,
        rulesetConfig,
      });
      
      // Validate schemaVersion
      if (!evidencePack.schemaVersion) {
        throw new Error("Evidence pack missing required schemaVersion field");
      }
      
      // Compute evidence hash
      const evidenceHash = await computeEvidenceHash(evidencePack);
      
      // Compute deterministic riskGrade from gates
      const riskGrade = computeRiskGrade(evidencePack.deliveryGates);
      
      // Count findings by severity
      const findingCounts = {
        red: evidencePack.findings.filter((f) => f.severity === "RED").length,
        yellow: evidencePack.findings.filter((f) => f.severity === "YELLOW").length,
        green: evidencePack.findings.filter((f) => f.severity === "GREEN").length,
        info: evidencePack.findings.filter((f) => f.severity === "INFO").length,
      };
      
      // Store findings
      for (const finding of evidencePack.findings) {
        await ctx.runMutation(internal.qcFindings.insert, {
          qcRunId: args.id,
          tenantId: run.tenantId,
          projectId: run.projectId,
          severity: finding.severity,
          category: finding.category as any,
          title: finding.title,
          description: finding.description,
          filePaths: finding.filePaths,
          lineRanges: finding.lineRanges,
          prdRefs: finding.prdRefs,
          suggestedFix: finding.suggestedFix,
          confidence: finding.confidence,
        });
      }
      
      // Store artifacts
      await ctx.runMutation(internal.qcArtifacts.store, {
        qcRunId: args.id,
        tenantId: run.tenantId,
        projectId: run.projectId,
        type: "EVIDENCE_PACK_JSON",
        name: `${run.runId}_evidence_pack.json`,
        content: JSON.stringify(evidencePack, null, 2),
        mimeType: "application/json",
        sizeBytes: JSON.stringify(evidencePack).length,
      });
      
      await ctx.runMutation(internal.qcArtifacts.store, {
        qcRunId: args.id,
        tenantId: run.tenantId,
        projectId: run.projectId,
        type: "SUMMARY_MD",
        name: `${run.runId}_summary.md`,
        content: evidencePack.summary,
        mimeType: "text/markdown",
        sizeBytes: evidencePack.summary.length,
      });
      
      // Complete run
      const gatePassed = evidencePack.deliveryGates.every((g) => g.passed);
      await ctx.runMutation(internal.qcRuns.complete, {
        id: args.id,
        status: "COMPLETED",
        riskGrade,
        qualityScore: evidencePack.qualityScore,
        findingCounts,
        gatePassed,
        evidenceHash,
      });
      
      // If RED, create alert and notify
      if (riskGrade === "RED") {
        await ctx.runMutation(api.alerts.create, {
          projectId: run.projectId,
          severity: "CRITICAL",
          type: "QC_GATE_FAILED",
          title: `QC Run ${run.runId} failed RED gate`,
          description: `Quality Control run for ${run.repoUrl} failed critical delivery gates. Review findings immediately.`,
          metadata: { qcRunId: args.id, runId: run.runId },
        });
        
        // TODO: Send Telegraph/Telegram notification
      }
      
      return { success: true, runId: run.runId, riskGrade, qualityScore: evidencePack.qualityScore };
      
    } catch (error: any) {
      // Mark as failed
      await ctx.runMutation(internal.qcRuns.complete, {
        id: args.id,
        status: "FAILED",
        error: error.message,
      });
      
      throw error;
    }
  },
});

/**
 * Transition run to RUNNING (internal)
 */
export const transitionToRunning = internalMutation({
  args: { id: v.id("qcRuns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "RUNNING" });
  },
});

// ============================================================================
// MOCK ASSURANCE CALL (STUB for v1)
// ============================================================================

async function mockAssuranceCall(request: {
  runId: string;
  repoUrl: string;
  commitSha?: string;
  branch?: string;
  scopeType: string;
  scopeSpec?: any;
  rulesetConfig: any;
}): Promise<QCEvidencePack> {
  // Mock evidence pack for testing
  return {
    schemaVersion: "1.0.0",
    producer: "assurance-agents-stub/0.1.0",
    runId: request.runId,
    repoUrl: request.repoUrl,
    commitSha: request.commitSha ?? "abc123def456",
    timestamp: new Date().toISOString(),
    docsIndex: [
      { path: "README.md", type: "README", lastModified: "2026-02-15T10:00:00Z" },
      { path: "docs/PRD_V2.md", type: "PRD", lastModified: "2026-02-10T14:30:00Z" },
    ],
    requirementTraceability: [
      {
        requirementId: "REQ-001",
        requirementText: "System must support multi-agent workflows",
        sourceDoc: "docs/PRD_V2.md",
        implementationFiles: [
          { path: "packages/workflow-engine/src/executor.ts", lineRange: [1, 50] },
        ],
        testFiles: [
          { path: "packages/workflow-engine/src/__tests__/executor.test.ts" },
        ],
        evidence: "Workflow engine implements deterministic multi-agent execution",
        status: "COVERED",
      },
    ],
    findings: [
      {
        severity: "YELLOW",
        category: "DOCS_DRIFT",
        title: "README outdated",
        description: "README.md last updated 5 days before recent code changes",
        filePaths: ["README.md"],
        confidence: 0.85,
      },
      {
        severity: "GREEN",
        category: "COVERAGE_GAP",
        title: "Test coverage acceptable",
        description: "Unit test coverage at 78%, above threshold",
        confidence: 0.95,
      },
    ],
    coverageSummary: {
      unit: { covered: 156, total: 200, percentage: 78 },
      integration: { covered: 24, total: 40, percentage: 60 },
      e2e: { covered: 8, total: 15, percentage: 53 },
      missingAreas: ["Error handling in workflow executor"],
    },
    deliveryGates: [
      {
        name: "PRD exists",
        passed: true,
        rationale: "Found docs/PRD_V2.md",
        severity: "YELLOW",
      },
      {
        name: "Tests exist",
        passed: true,
        rationale: "Test coverage above minimum threshold",
        severity: "RED",
      },
    ],
    riskGrade: "YELLOW",
    qualityScore: 82,
    policyNotes: ["All gates passed except docs drift"],
    summary: `# QC Run ${request.runId}\n\n**Status:** PASSED (with warnings)\n\n## Findings\n- 1 YELLOW: README outdated\n- 1 GREEN: Coverage acceptable\n\n## Coverage\n- Unit: 78%\n- Integration: 60%\n- E2E: 53%`,
  };
}
