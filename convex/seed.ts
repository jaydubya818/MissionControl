/**
 * Seed Data — V0
 * 
 * Creates sample agents and tasks for testing.
 * Run with: npx convex run seed:seedV0
 */

import { mutation, query } from "./_generated/server";

export const seedV0 = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if already seeded
    const existingAgents = await ctx.db.query("agents").take(1);
    if (existingAgents.length > 0) {
      return { message: "Already seeded", skipped: true };
    }

    // =========================================================================
    // DEFAULT PROJECT
    // =========================================================================
    
    const projectId = await ctx.db.insert("projects", {
      name: "OpenClaw",
      slug: "openclaw",
      description: "Default project for OpenClaw autonomous agents.",
      policyDefaults: {
        budgetDefaults: {
          INTERN: { daily: 2.00, perRun: 0.25 },
          SPECIALIST: { daily: 5.00, perRun: 0.75 },
          LEAD: { daily: 12.00, perRun: 1.50 },
        },
      },
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId,
      actorType: "SYSTEM",
      action: "PROJECT_CREATED",
      description: `Default project "OpenClaw" created`,
      targetType: "PROJECT",
      targetId: projectId,
    });

    // =========================================================================
    // AGENTS (11 total: 4 INTERN, 4 SPECIALIST, 3 LEAD including Sofie as CAO)
    // =========================================================================
    
    const agentConfigs = [
      // SOFIE - Chief Agent Officer (CAO) - Top-level orchestrator
      {
        name: "Sofie",
        emoji: "🎯",
        role: "LEAD",
        allowedTaskTypes: ["STRATEGIC", "OPS", "CONTENT", "ENGINEERING", "DOCS", "SOCIAL", "CUSTOMER_RESEARCH", "EMAIL_MARKETING"],
        budgetDaily: 12.00,
        budgetPerRun: 1.50,
        canSpawn: true,
        maxSubAgents: 4,
        isCAO: true,
      },
      // PERRY - Chief Operating Officer (COO) - Operations lead for SellerFi
      {
        name: "Perry",
        emoji: "📊",
        role: "LEAD",
        allowedTaskTypes: ["OPS", "STRATEGIC", "DOCS", "CUSTOMER_RESEARCH"],
        budgetDaily: 12.00,
        budgetPerRun: 1.50,
        canSpawn: true,
        maxSubAgents: 3,
      },
      // SELLERFI - Developer/Programmer - SellerFi platform development
      {
        name: "SellerFi",
        emoji: "⚡",
        role: "SPECIALIST",
        allowedTaskTypes: ["ENGINEERING", "DOCS", "OPS"],
        budgetDaily: 5.00,
        budgetPerRun: 0.75,
        canSpawn: true,
        maxSubAgents: 2,
      },
      // COACH - Fitness & Productivity (Telegram Bot)
      {
        name: "Coach",
        emoji: "🏋️",
        role: "SPECIALIST",
        allowedTaskTypes: ["OPS", "CONTENT", "CUSTOMER_RESEARCH"],
        budgetDaily: 5.00,
        budgetPerRun: 0.75,
        canSpawn: true,
        maxSubAgents: 2,
      },
      // CASEY - Operations & Documentation (Telegram Bot)
      {
        name: "Casey",
        emoji: "📋",
        role: "SPECIALIST",
        allowedTaskTypes: ["DOCS", "OPS", "CONTENT"],
        budgetDaily: 5.00,
        budgetPerRun: 0.75,
        canSpawn: true,
        maxSubAgents: 2,
      },
      // ALEX - Engineering & Development (Telegram Bot)
      {
        name: "Alex",
        emoji: "💻",
        role: "SPECIALIST",
        allowedTaskTypes: ["ENGINEERING", "DOCS"],
        budgetDaily: 5.00,
        budgetPerRun: 0.75,
        canSpawn: true,
        maxSubAgents: 2,
      },
      // JORDAN - Media & Creative (Telegram Bot)
      {
        name: "Jordan",
        emoji: "🎧",
        role: "SPECIALIST",
        allowedTaskTypes: ["SOCIAL", "CONTENT", "EMAIL_MARKETING"],
        budgetDaily: 5.00,
        budgetPerRun: 0.75,
        canSpawn: true,
        maxSubAgents: 2,
      },
      // SCOUT - Customer Research & SEO (INTERN)
      {
        name: "Scout",
        emoji: "🔍",
        role: "INTERN",
        allowedTaskTypes: ["CUSTOMER_RESEARCH", "CONTENT"],
        budgetDaily: 2.00,
        budgetPerRun: 0.25,
        canSpawn: false,
        maxSubAgents: 0,
      },
      // SCRIBE - Documentation & Content (INTERN)
      {
        name: "Scribe",
        emoji: "✍️",
        role: "INTERN",
        allowedTaskTypes: ["DOCS", "CONTENT"],
        budgetDaily: 2.00,
        budgetPerRun: 0.25,
        canSpawn: false,
        maxSubAgents: 0,
      },
      // PIXEL - Social Media & Content (INTERN)
      {
        name: "Pixel",
        emoji: "🎨",
        role: "INTERN",
        allowedTaskTypes: ["SOCIAL", "CONTENT"],
        budgetDaily: 2.00,
        budgetPerRun: 0.25,
        canSpawn: false,
        maxSubAgents: 0,
      },
      // CHIP - Engineering & Docs (INTERN)
      {
        name: "Chip",
        emoji: "🔧",
        role: "INTERN",
        allowedTaskTypes: ["ENGINEERING", "DOCS"],
        budgetDaily: 2.00,
        budgetPerRun: 0.25,
        canSpawn: false,
        maxSubAgents: 0,
      },
    ];

    const agentIds: Record<string, any> = {};
    
    for (const config of agentConfigs) {
      const agentId = await ctx.db.insert("agents", {
        projectId,
        name: config.name,
        emoji: config.emoji,
        role: config.role as any,
        status: "ACTIVE",
        workspacePath: `~/.openclaw/agents/${config.name.toLowerCase()}`,
        allowedTaskTypes: config.allowedTaskTypes,
        budgetDaily: config.budgetDaily,
        budgetPerRun: config.budgetPerRun,
        spendToday: 0,
        canSpawn: config.canSpawn,
        maxSubAgents: config.maxSubAgents ?? 0,
        errorStreak: 0,
        lastHeartbeatAt: Date.now(),
        soulVersionHash: (config as any).isCAO ? "sha256-a1b2c3d4e5f6" : undefined,
        metadata: (config as any).isCAO
          ? {
              isCAO: true,
              role: "Chief Agent Officer",
              telegram: "@sofie_cao_bot",
              discord: "Sofie#0001",
              model: "Claude Opus 4",
              systemPrompt: `You are Sofie, the Chief Agent Officer (CAO) for Mission Control. You oversee all agent operations, delegate strategic work, monitor agent health and budgets, resolve conflicts, and escalate to humans when needed. You do NOT execute domain work directly.`,
            }
          : undefined,
      });
      agentIds[config.name] = agentId;
    }

    // =========================================================================
    // SOFIE AGENT DOCUMENTS (WORKING.md, Daily Note, Session Memory)
    // =========================================================================

    const sofieId = agentIds["Sofie"];
    if (sofieId) {
      const now = Date.now();

      // WORKING.md — Sofie's active working memory
      await ctx.db.insert("agentDocuments", {
        agentId: sofieId,
        type: "WORKING_MD",
        content: `# Sofie — Working Document

## Current Priorities
1. Monitor all agent health and error streaks
2. Ensure daily budgets are being respected
3. Delegate incoming INBOX tasks to appropriate specialists
4. Review tasks in REVIEW status for quality

## Active Delegations
| Task | Assigned To | Status | Notes |
|------|-------------|--------|-------|
| API Docs Update | Casey | IN_PROGRESS | On track |
| Social Campaign | Jordan | REVIEW | Needs final check |
| Competitor Research | Scout | INBOX | Unassigned, will delegate |

## Agent Health Summary
- **Perry** (COO): ACTIVE, healthy, 0 errors
- **SellerFi**: ACTIVE, healthy, 0 errors
- **Coach**: ACTIVE, healthy, 0 errors
- **Casey**: ACTIVE, working on docs, 0 errors
- **Alex**: ACTIVE, healthy, 0 errors
- **Jordan**: ACTIVE, content work, 0 errors
- **Scout**: ACTIVE, available for research, 0 errors
- **Scribe**: ACTIVE, available, 0 errors
- **Pixel**: ACTIVE, available, 0 errors
- **Chip**: ACTIVE, available, 0 errors

## Notes
- Next strategic review scheduled for end of sprint
- Consider spawning a sub-agent for the email marketing backlog
`,
        updatedAt: now,
        metadata: { version: 1 },
      });

      // Daily Note
      await ctx.db.insert("agentDocuments", {
        agentId: sofieId,
        type: "DAILY_NOTE",
        content: `# Daily Note — ${new Date().toISOString().split("T")[0]}

## Morning Review
- All 10 agents reporting ACTIVE status
- No error streaks detected
- Budget utilization: 15% of daily across all agents
- 3 tasks in INBOX awaiting delegation

## Actions Taken
- Reviewed Casey's API documentation progress — on track
- Checked Jordan's social campaign submission — in REVIEW
- Identified competitor research task for Scout delegation

## Escalations
- None today

## End of Day Summary
- Pending: will update at EOD
`,
        updatedAt: now,
        metadata: { date: new Date().toISOString().split("T")[0] },
      });

      // Session Memory
      await ctx.db.insert("agentDocuments", {
        agentId: sofieId,
        type: "SESSION_MEMORY",
        content: `# Session Memory — Sofie

## Context
- Project: OpenClaw
- Role: CAO (Chief Agent Officer)
- Reporting to: Human CHO (Chief Human Officer)

## Last Session Summary
- Delegated 2 tasks to specialists
- Resolved a resource conflict between Casey and Scribe (both wanted the docs repo)
- Approved Perry's operational plan for the week

## Persistent State
- Preferred delegation strategy: capability-first, then capacity
- Current sprint focus: content pipeline + API documentation
- Risk level: GREEN across all agents
`,
        updatedAt: now,
        metadata: { sessionId: "session-001" },
      });
    }

    // =========================================================================
    // TASKS (8 total, one for each status)
    // =========================================================================
    
    const taskConfigs = [
      // INBOX
      {
        title: "Research competitor pricing strategies",
        description: "Analyze top 5 competitors' pricing pages and subscription tiers. Create comparison matrix.",
        type: "CUSTOMER_RESEARCH",
        status: "INBOX",
        priority: 3,
        labels: ["research", "competitive-analysis"],
      },
      
      // ASSIGNED
      {
        title: "Write blog post about AI automation",
        description: "1500-word blog post on how AI agents are transforming business operations.",
        type: "CONTENT",
        status: "ASSIGNED",
        priority: 2,
        assigneeNames: ["Jordan"],
        labels: ["content", "blog"],
      },
      
      // IN_PROGRESS
      {
        title: "Update API documentation",
        description: "Review and update REST API docs. Add examples for new endpoints.",
        type: "DOCS",
        status: "IN_PROGRESS",
        priority: 2,
        assigneeNames: ["Casey"],
        workPlan: {
          bullets: [
            "Audit existing API docs for outdated information",
            "Document new /agents and /tasks endpoints",
            "Add curl examples for each endpoint",
            "Update authentication section",
          ],
        },
        labels: ["docs", "api"],
      },
      
      // REVIEW
      {
        title: "Design social media campaign",
        description: "Create 10 social media posts for product launch. Include copy and image prompts.",
        type: "SOCIAL",
        status: "REVIEW",
        priority: 2,
        assigneeNames: ["Jordan"],
        reviewerName: "Coach",
        workPlan: {
          bullets: [
            "Research trending formats on Twitter/LinkedIn",
            "Draft 10 post variations",
            "Create image prompts for each post",
            "Schedule content calendar",
          ],
        },
        deliverable: {
          summary: "10 social media posts ready for launch week",
          artifactIds: ["posts-draft.md", "image-prompts.md"],
        },
        labels: ["social", "launch"],
      },
      
      // NEEDS_APPROVAL
      {
        title: "Set up automated email sequences",
        description: "Configure 5-email onboarding sequence for new users.",
        type: "EMAIL_MARKETING",
        status: "NEEDS_APPROVAL",
        priority: 1,
        assigneeNames: ["Jordan"],
        labels: ["email", "automation", "high-priority"],
      },
      
      // BLOCKED
      {
        title: "Integrate payment provider",
        description: "Add Stripe integration for subscription billing.",
        type: "ENGINEERING",
        status: "BLOCKED",
        priority: 1,
        assigneeNames: ["Alex"],
        blockedReason: "Waiting for Stripe API keys from finance team",
        labels: ["engineering", "payments", "blocked"],
      },
      
      // DONE
      {
        title: "Create onboarding checklist",
        description: "Design step-by-step onboarding flow for new users.",
        type: "OPS",
        status: "DONE",
        priority: 3,
        assigneeNames: ["Casey"],
        completedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
        labels: ["ops", "onboarding"],
      },
      
      // CANCELED
      {
        title: "Build custom analytics dashboard",
        description: "Create real-time analytics dashboard. [Canceled: Using existing tool instead]",
        type: "ENGINEERING",
        status: "CANCELED",
        priority: 4,
        labels: ["engineering", "canceled"],
      },
    ];

    const taskIds: any[] = [];
    
    for (const config of taskConfigs) {
      const assigneeIds = (config.assigneeNames || [])
        .map((name: string) => agentIds[name])
        .filter(Boolean);
      
      const reviewerId = config.reviewerName ? agentIds[config.reviewerName] : undefined;
      
      const taskId = await ctx.db.insert("tasks", {
        projectId,
        title: config.title,
        description: config.description,
        type: config.type as any,
        status: config.status as any,
        priority: config.priority as any,
        assigneeIds,
        reviewerId,
        workPlan: config.workPlan,
        deliverable: config.deliverable,
        blockedReason: config.blockedReason,
        reviewCycles: config.status === "REVIEW" ? 1 : 0,
        actualCost: 0,
        completedAt: config.completedAt,
        startedAt: ["IN_PROGRESS", "REVIEW", "BLOCKED", "DONE", "NEEDS_APPROVAL"].includes(config.status) 
          ? Date.now() - 3 * 24 * 60 * 60 * 1000 
          : undefined,
        labels: config.labels,
      });
      taskIds.push({ id: taskId, status: config.status });
      
      // Create initial transition
      await ctx.db.insert("taskTransitions", {
        projectId,
        idempotencyKey: `seed:${taskId}:initial`,
        taskId,
        fromStatus: "INBOX",
        toStatus: config.status,
        actorType: "SYSTEM",
        reason: "Seeded for V0 demo",
      });
    }

    // =========================================================================
    // SAMPLE MESSAGES
    // =========================================================================
    
    // Add messages to the IN_PROGRESS task
    const inProgressTask = taskIds.find(t => t.status === "IN_PROGRESS");
    if (inProgressTask) {
      await ctx.db.insert("messages", {
        projectId,
        taskId: inProgressTask.id,
        authorType: "AGENT",
        authorAgentId: agentIds["Casey"],
        type: "WORK_PLAN",
        content: "## Work Plan\n\n1. Audit existing API docs for outdated information\n2. Document new /agents and /tasks endpoints\n3. Add curl examples for each endpoint\n4. Update authentication section\n\n**Estimated Duration:** 4 hours",
      });
      
      await ctx.db.insert("messages", {
        projectId,
        taskId: inProgressTask.id,
        authorType: "AGENT",
        authorAgentId: agentIds["Casey"],
        type: "PROGRESS",
        content: "**Progress: 40%**\n\nCompleted audit of existing docs. Found 3 deprecated endpoints and 2 missing new ones. Starting documentation of /agents endpoint now.",
      });
    }
    
    // Add messages to the REVIEW task
    const reviewTask = taskIds.find(t => t.status === "REVIEW");
    if (reviewTask) {
      await ctx.db.insert("messages", {
        projectId,
        taskId: reviewTask.id,
        authorType: "AGENT",
        authorAgentId: agentIds["Jordan"],
        type: "ARTIFACT",
        content: "## Deliverable: Social Media Campaign\n\nAttached 10 posts with copy and image prompts. Ready for review.",
        artifacts: [
          { name: "posts-draft.md", type: "text/markdown" },
          { name: "image-prompts.md", type: "text/markdown" },
        ],
      });
      
      await ctx.db.insert("messages", {
        projectId,
        taskId: reviewTask.id,
        authorType: "HUMAN",
        authorUserId: "jay",
        type: "COMMENT",
        content: "Looking good! Can we add more variety to the image styles? Some feel repetitive.",
      });
    }

    // =========================================================================
    // DEFAULT POLICY
    // =========================================================================
    
    await ctx.db.insert("policies", {
      projectId, // Associate with default project
      version: 1,
      name: "Default V0 Policy",
      scopeType: "GLOBAL",
      rules: {
        reviewToDoneRequiresHuman: true,
        reviewToDoneRequiresApproval: true,
        budgetExceededRequiresApproval: true,
        redToolsRequireApproval: true,
        // CAO authority rules - Sofie as Chief Agent Officer
        caoAgentName: "Sofie",
        caoApprovalRequired: true,
      },
      toolRiskMap: {
        // GREEN - safe
        "read": "GREEN",
        "web_search": "GREEN",
        "web_fetch": "GREEN",
        "memory_search": "GREEN",
        
        // YELLOW - caution
        "write": "YELLOW",
        "edit": "YELLOW",
        "exec": "YELLOW",
        "bash": "YELLOW",
        "shell": "YELLOW",
        "browser": "YELLOW",
        
        // RED - requires approval
        "message": "RED",
        "gateway": "RED",
        "cron": "RED",
        "deploy": "RED",
      },
      shellAllowlist: [
        "ls", "cat", "grep", "find", "pwd", "echo",
        "git status", "git diff", "git log", "git branch",
        "npm", "pnpm", "yarn",
        "node", "python", "python3",
      ],
      shellBlocklist: [
        "rm -rf",
        "sudo",
        "chmod 777",
        "curl | bash",
        "wget | sh",
        "../",
        "~/.ssh",
        "/etc/",
      ],
      fileReadPaths: [
        "**/*.ts",
        "**/*.tsx",
        "**/*.js",
        "**/*.jsx",
        "**/*.json",
        "**/*.md",
        "**/*.txt",
        "**/*.yaml",
        "**/*.yml",
      ],
      fileWritePaths: [
        "**/*.ts",
        "**/*.tsx",
        "**/*.js",
        "**/*.jsx",
        "**/*.json",
        "**/*.md",
        "**/*.txt",
      ],
      networkAllowlist: [
        "api.convex.dev",
        "github.com",
        "api.github.com",
        "npmjs.com",
        "registry.npmjs.org",
      ],
      budgetDefaults: {
        INTERN: { daily: 2.00, perRun: 0.25 },
        SPECIALIST: { daily: 5.00, perRun: 0.75 },
        LEAD: { daily: 12.00, perRun: 1.50 },
      },
      spawnLimits: {
        maxGlobalActive: 30,
        maxPerParent: 3,
        maxDepth: 2,
      },
      loopThresholds: {
        maxCommentsPerWindow: 20,
        windowMinutes: 30,
        maxReviewCycles: 3,
        maxPingPong: 8,
      },
      active: true,
      createdBy: "seed",
      notes: "Default policy for V0 demo. Sofie is CAO. Includes allowlists for shell, filesystem, and network.",
    });

    return {
      message: "V0 seed complete!",
      projects: 1,
      agents: Object.keys(agentIds).length,
      tasks: taskIds.length,
      policies: 1,
    };
  },
});

/**
 * Backfill BJ's agent documents and metadata.
 * Safe to run multiple times — skips if documents already exist.
 * Run with: npx convex run seed:backfillBJDocs
 */
export const backfillBJDocs = mutation({
  args: {},
  handler: async (ctx) => {
    // Find BJ
    const bj = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("name"), "BJ"))
      .first();

    if (!bj) {
      return { message: "BJ agent not found", skipped: true };
    }

    const results: string[] = [];
    const now = Date.now();

    // Update metadata & soulVersionHash if missing
    if (!bj.soulVersionHash) {
      await ctx.db.patch(bj._id, {
        soulVersionHash: "sha256-bj7e8f9a0b1c",
        emoji: "👨‍💼",
      });
      results.push("Added soulVersionHash and emoji");
    }

    const meta = (bj.metadata as Record<string, unknown>) || {};
    if (!meta.telegram) {
      await ctx.db.patch(bj._id, {
        metadata: {
          ...meta,
          description: "Supervisor Orchestrator - Master supervisor with comprehensive knowledge of all 151+ agents. Primary point of contact for SellerFi work.",
          telegram: "@bj_sellerfi_bot",
          discord: "BJ#0001",
          whatsapp: "+1-555-BJ-AGENT",
          model: "Claude Opus 4",
          systemPrompt: `You are BJ, the Supervisor Orchestrator for SellerFi. You have comprehensive knowledge of all 151+ agents. You coordinate all SellerFi work — delegating to Tech Lead, Backend Architect, Frontend Developer, and other specialists. You do NOT implement directly.`,
        },
      });
      results.push("Updated metadata with contacts and system prompt");
    }

    // Seed WORKING_MD if not exists
    const existingWorking = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", bj._id).eq("type", "WORKING_MD")
      )
      .first();

    if (!existingWorking) {
      await ctx.db.insert("agentDocuments", {
        agentId: bj._id,
        type: "WORKING_MD",
        content: `# BJ — Working Document

## Current Priorities
1. Oversee SellerFi platform development across all agents
2. Ensure Tech Lead and Backend Architect are aligned on architecture
3. Monitor Frontend Developer progress on UI components
4. Track Code Reviewer queue — no PRs should sit unreviewed > 24h
5. Keep Context Manager synced on project state

## Active Delegations
| Task | Assigned To | Status | Notes |
|------|-------------|--------|-------|
| API Architecture Review | Tech Lead | IN_PROGRESS | Backend redesign |
| Payment Integration | Backend Architect | PLANNING | Stripe integration |
| Dashboard UI Refresh | Frontend Developer | IN_PROGRESS | React components |
| Security Audit Sprint | Security Auditor | ASSIGNED | Pre-launch checklist |
| CI/CD Pipeline | DevOps Engineer | IN_PROGRESS | GitHub Actions |

## Team Health
- **Agent Organizer**: ACTIVE, managing team structure
- **Tech Lead**: ACTIVE, driving architecture decisions
- **Context Manager**: ACTIVE, maintaining project context
- **Backend Architect**: ACTIVE, API design work
- **Frontend Developer**: ACTIVE, UI development
- **Code Reviewer**: ACTIVE, reviewing PRs
- **Test Writer**: ACTIVE, writing test suites
- **Security Auditor**: ACTIVE, audit in progress
- **DevOps Engineer**: ACTIVE, pipeline work
- **Documentation Writer**: ACTIVE, updating docs

## Notes
- SellerFi launch target: track progress daily
- Jay wants weekly status reports — compile every Friday
- Consider adding a Data Engineer agent for analytics pipeline
`,
        updatedAt: now,
        metadata: { version: 1 },
      });
      results.push("Created WORKING_MD");
    }

    // Seed DAILY_NOTE if not exists
    const existingDaily = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", bj._id).eq("type", "DAILY_NOTE")
      )
      .first();

    if (!existingDaily) {
      const today = new Date().toISOString().split("T")[0];
      await ctx.db.insert("agentDocuments", {
        agentId: bj._id,
        type: "DAILY_NOTE",
        content: `# Daily Note — ${today}

## Morning Standup
- All 10 SellerFi agents reporting ACTIVE status
- No error streaks detected
- Budget utilization: 22% of daily across all agents
- 2 PRs awaiting code review
- Security audit sprint at 40% completion

## Actions Taken
- Reviewed Tech Lead's architecture proposal for payment service
- Delegated Stripe integration research to Backend Architect
- Checked Frontend Developer's dashboard component progress
- Reviewed Code Reviewer's latest feedback on API endpoints

## Blockers
- Waiting on Jay's approval for production deployment permissions

## Escalations
- None today

## End of Day Summary
- Pending: will update at EOD
`,
        updatedAt: now,
        metadata: { date: today },
      });
      results.push("Created DAILY_NOTE");
    }

    // Seed SESSION_MEMORY if not exists
    const existingSession = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", bj._id).eq("type", "SESSION_MEMORY")
      )
      .first();

    if (!existingSession) {
      await ctx.db.insert("agentDocuments", {
        agentId: bj._id,
        type: "SESSION_MEMORY",
        content: `# Session Memory — BJ

## Context
- Project: SellerFi
- Role: Supervisor Orchestrator
- Reporting to: Jay (Human / Project Owner)
- Team size: 10 agents (3 LEAD, 7 SPECIALIST)

## Last Session Summary
- Kicked off security audit sprint with Security Auditor
- Aligned Tech Lead and Backend Architect on API v2 design
- Reviewed Frontend Developer's component library progress
- Updated Context Manager with sprint goals

## Persistent State
- Preferred delegation strategy: expertise-first, then availability
- Current sprint focus: payment integration + security audit
- Risk level: GREEN across all agents
- SellerFi workspace: /Users/jaywest/SellerFi-GitHub

## Key Decisions Log
<!-- These are immutable historical seed records representing the initial session state -->
- ${new Date().toISOString().slice(0, 10)}: Chose Stripe over PayPal for payment integration
- ${new Date().toISOString().slice(0, 10)}: Approved Tech Lead's microservice architecture proposal
- ${new Date().toISOString().slice(0, 10)}: Prioritized security audit before launch
`,
        updatedAt: now,
        metadata: { sessionId: "sellerfi-session-001" },
      });
      results.push("Created SESSION_MEMORY");
    }

    return {
      message: results.length > 0
        ? `Backfilled BJ: ${results.join(", ")}`
        : "BJ already fully backfilled",
      actions: results,
    };
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    // Clear all tables (for development reset)
    const tables = [
      "projects",
      "agents",
      "tasks",
      "taskTransitions",
      "messages",
      "runs",
      "toolCalls",
      "approvals",
      "activities",
      "alerts",
      "policies",
      "notifications",
      "threadSubscriptions",
      "agentDocuments",
    ];
    
    let deleted = 0;
    
    for (const table of tables) {
      const docs = await ctx.db.query(table as any).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        deleted++;
      }
    }
    
    return { message: "All data cleared", deleted };
  },
});

/**
 * Backfill Sofie's agent documents and metadata.
 * Safe to run multiple times — skips if documents already exist.
 * Run with: npx convex run seed:backfillSofieDocs
 */
export const backfillSofieDocs = mutation({
  args: {},
  handler: async (ctx) => {
    // Find Sofie
    const sofie = await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("name"), "Sofie"))
      .first();

    if (!sofie) {
      return { message: "Sofie agent not found", skipped: true };
    }

    const results: string[] = [];
    const now = Date.now();

    // Update metadata & soulVersionHash if missing
    if (!sofie.soulVersionHash) {
      await ctx.db.patch(sofie._id, {
        soulVersionHash: "sha256-a1b2c3d4e5f6",
      });
      results.push("Added soulVersionHash");
    }

    const meta = (sofie.metadata as Record<string, unknown>) || {};
    if (!meta.telegram) {
      await ctx.db.patch(sofie._id, {
        metadata: {
          ...meta,
          isCAO: true,
          role: "Chief Agent Officer",
          telegram: "@sofie_cao_bot",
          discord: "Sofie#0001",
          model: "Claude Opus 4",
          systemPrompt: `You are Sofie, the Chief Agent Officer (CAO) for Mission Control. You oversee all agent operations, delegate strategic work, monitor agent health and budgets, resolve conflicts, and escalate to humans when needed. You do NOT execute domain work directly.`,
        },
      });
      results.push("Updated metadata with contacts and system prompt");
    }

    // Seed WORKING_MD if not exists
    const existingWorking = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", sofie._id).eq("type", "WORKING_MD")
      )
      .first();

    if (!existingWorking) {
      await ctx.db.insert("agentDocuments", {
        agentId: sofie._id,
        type: "WORKING_MD",
        content: `# Sofie — Working Document

## Current Priorities
1. Monitor all agent health and error streaks
2. Ensure daily budgets are being respected
3. Delegate incoming INBOX tasks to appropriate specialists
4. Review tasks in REVIEW status for quality

## Active Delegations
| Task | Assigned To | Status | Notes |
|------|-------------|--------|-------|
| API Docs Update | Casey | IN_PROGRESS | On track |
| Social Campaign | Jordan | REVIEW | Needs final check |
| Competitor Research | Scout | INBOX | Unassigned, will delegate |

## Agent Health Summary
- **Perry** (COO): ACTIVE, healthy, 0 errors
- **SellerFi**: ACTIVE, healthy, 0 errors
- **Coach**: ACTIVE, healthy, 0 errors
- **Casey**: ACTIVE, working on docs, 0 errors
- **Alex**: ACTIVE, healthy, 0 errors
- **Jordan**: ACTIVE, content work, 0 errors
- **Scout**: ACTIVE, available for research, 0 errors
- **Scribe**: ACTIVE, available, 0 errors
- **Pixel**: ACTIVE, available, 0 errors
- **Chip**: ACTIVE, available, 0 errors

## Notes
- Next strategic review scheduled for end of sprint
- Consider spawning a sub-agent for the email marketing backlog
`,
        updatedAt: now,
        metadata: { version: 1 },
      });
      results.push("Created WORKING_MD");
    }

    // Seed DAILY_NOTE if not exists
    const existingDaily = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", sofie._id).eq("type", "DAILY_NOTE")
      )
      .first();

    if (!existingDaily) {
      const today = new Date().toISOString().split("T")[0];
      await ctx.db.insert("agentDocuments", {
        agentId: sofie._id,
        type: "DAILY_NOTE",
        content: `# Daily Note — ${today}

## Morning Review
- All 10 agents reporting ACTIVE status
- No error streaks detected
- Budget utilization: 15% of daily across all agents
- 3 tasks in INBOX awaiting delegation

## Actions Taken
- Reviewed Casey's API documentation progress — on track
- Checked Jordan's social campaign submission — in REVIEW
- Identified competitor research task for Scout delegation

## Escalations
- None today

## End of Day Summary
- Pending: will update at EOD
`,
        updatedAt: now,
        metadata: { date: today },
      });
      results.push("Created DAILY_NOTE");
    }

    // Seed SESSION_MEMORY if not exists
    const existingSession = await ctx.db
      .query("agentDocuments")
      .withIndex("by_agent_type", (q) =>
        q.eq("agentId", sofie._id).eq("type", "SESSION_MEMORY")
      )
      .first();

    if (!existingSession) {
      await ctx.db.insert("agentDocuments", {
        agentId: sofie._id,
        type: "SESSION_MEMORY",
        content: `# Session Memory — Sofie

## Context
- Project: OpenClaw
- Role: CAO (Chief Agent Officer)
- Reporting to: Human CHO (Chief Human Officer)

## Last Session Summary
- Delegated 2 tasks to specialists
- Resolved a resource conflict between Casey and Scribe (both wanted the docs repo)
- Approved Perry's operational plan for the week

## Persistent State
- Preferred delegation strategy: capability-first, then capacity
- Current sprint focus: content pipeline + API documentation
- Risk level: GREEN across all agents
`,
        updatedAt: now,
        metadata: { sessionId: "session-001" },
      });
      results.push("Created SESSION_MEMORY");
    }

    return {
      message: results.length > 0
        ? `Backfilled Sofie: ${results.join(", ")}`
        : "Sofie already fully backfilled",
      actions: results,
    };
  },
});

export const getSeededStatus = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").take(1);
    const agents = await ctx.db.query("agents").take(1);
    const tasks = await ctx.db.query("tasks").take(1);
    const policies = await ctx.db.query("policies").take(1);
    
    return {
      seeded: projects.length > 0 || agents.length > 0 || tasks.length > 0 || policies.length > 0,
      projectCount: (await ctx.db.query("projects").collect()).length,
      agentCount: (await ctx.db.query("agents").collect()).length,
      taskCount: (await ctx.db.query("tasks").collect()).length,
      policyCount: (await ctx.db.query("policies").collect()).length,
    };
  },
});

/**
 * Activate specific agents for demo/testing — sets them ACTIVE with fresh
 * heartbeat and creates dedicated IN_PROGRESS tasks.
 * Run with: npx convex run seed:activateAgentsForDemo
 */
export const activateAgentsForDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const results: string[] = [];

    const demoConfigs = [
      {
        name: "Sofie",
        spend: 3.75,
        taskTitle: "Review Q1 agent performance metrics and optimize squad allocation",
        taskType: "OPS" as const,
      },
      {
        name: "BJ",
        spend: 1.20,
        taskTitle: "Coordinate SellerFi backend architecture review with specialists",
        taskType: "ENGINEERING" as const,
      },
    ];

    for (const cfg of demoConfigs) {
      const agent = await ctx.db
        .query("agents")
        .filter((q) => q.eq(q.field("name"), cfg.name))
        .first();

      if (!agent) {
        results.push(`${cfg.name}: not found`);
        continue;
      }

      // Create a dedicated task (direct insert for seed data — includes description)
      const taskId = await ctx.db.insert("tasks", {
        projectId: agent.projectId,
        title: cfg.taskTitle,
        description: `Seed demo task for ${cfg.name}: ${cfg.taskTitle}`,
        type: cfg.taskType,
        status: "IN_PROGRESS",
        priority: 2,
        assigneeIds: [agent._id],
        reviewCycles: 0,
        actualCost: 0,
        startedAt: now - 15 * 60 * 1000,
        source: "SEED",
        workPlan: {
          bullets: ["Analyze current metrics", "Identify bottlenecks", "Propose optimizations"],
          estimatedCost: 2.50,
          estimatedDuration: "45 minutes",
        },
      });

      // Set ACTIVE with fresh heartbeat + currentTaskId
      await ctx.db.patch(agent._id, {
        status: "ACTIVE",
        lastHeartbeatAt: now,
        errorStreak: 0,
        lastError: undefined,
        spendToday: cfg.spend,
        currentTaskId: taskId,
      });

      results.push(`${cfg.name}: ACTIVE, working on "${cfg.taskTitle}"`);
    }

    return { results };
  },
});

/**
 * Seed Council data — approvals (APPROVED, DENIED, PENDING) and coordinator activities.
 * Creates realistic multi-agent decision-making data for the Council view.
 * Run with: npx convex run seed:seedCouncilData
 */
export const seedCouncilData = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    // Get all agents
    const agents = await ctx.db.query("agents").collect();
    if (agents.length === 0) {
      return { message: "No agents found. Run seedV0 first.", skipped: true };
    }

    // Get first project
    const project = await ctx.db.query("projects").first();
    if (!project) {
      return { message: "No project found. Run seedV0 first.", skipped: true };
    }
    const projectId = project._id;

    // Get some tasks for references
    const tasks = await ctx.db.query("tasks").take(8);

    // Build agent lookup
    const agentByName: Record<string, typeof agents[0]> = {};
    for (const a of agents) {
      agentByName[a.name] = a;
    }

    const sofie = agentByName["Sofie"];
    const perry = agentByName["Perry"];
    const alex = agentByName["Alex"];
    const jordan = agentByName["Jordan"];
    const casey = agentByName["Casey"];
    const coach = agentByName["Coach"];
    const sellerfi = agentByName["SellerFi"];

    if (!sofie) {
      return { message: "Sofie agent not found. Run seedV0 first.", skipped: true };
    }

    let approvalsCreated = 0;
    let activitiesCreated = 0;

    // =========================================================================
    // APPROVAL DECISIONS (mix of APPROVED, DENIED, PENDING)
    // =========================================================================

    const approvalConfigs = [
      // APPROVED decisions
      {
        requestor: jordan,
        actionType: "DEPLOY",
        actionSummary: "Deploy social media content pipeline to production",
        riskLevel: "RED" as const,
        justification: "Content pipeline has been tested in staging for 3 days with zero errors. All posts reviewed by Coach.",
        status: "APPROVED" as const,
        decidedByUserId: "jay",
        decisionReason: "Staging tests look solid. Approved for production deployment.",
        timeAgo: 2 * HOUR,
        estimatedCost: 0.50,
        taskIndex: 3, // REVIEW task
      },
      {
        requestor: alex,
        actionType: "SHELL_EXEC",
        actionSummary: "Execute database migration script for payment schema",
        riskLevel: "RED" as const,
        justification: "Migration adds payment_intents table and indexes. Rollback script prepared. Tested on dev DB.",
        status: "APPROVED" as const,
        decidedByUserId: "jay",
        decisionReason: "Rollback plan is solid. Execute during low-traffic window.",
        timeAgo: 6 * HOUR,
        estimatedCost: 0.25,
        taskIndex: 5, // BLOCKED task
      },
      {
        requestor: casey,
        actionType: "FILE_WRITE",
        actionSummary: "Overwrite production API documentation with v2 spec",
        riskLevel: "YELLOW" as const,
        justification: "v2 API docs are complete and reviewed. Old docs will be archived to /docs/archive/.",
        status: "APPROVED" as const,
        decidedByAgentId: sofie?._id,
        decisionReason: "Docs reviewed and archived. Proceed with publish.",
        timeAgo: 1 * DAY,
        taskIndex: 2, // IN_PROGRESS task
      },
      {
        requestor: sellerfi,
        actionType: "SHELL_EXEC",
        actionSummary: "Run npm audit fix --force to patch 3 critical vulnerabilities",
        riskLevel: "YELLOW" as const,
        justification: "npm audit found 3 critical CVEs in dependencies. --force needed for breaking semver updates.",
        status: "APPROVED" as const,
        decidedByAgentId: sofie?._id,
        decisionReason: "Critical CVEs must be patched. Run in isolated branch first.",
        timeAgo: 1.5 * DAY,
      },

      // DENIED decisions
      {
        requestor: jordan,
        actionType: "GATEWAY",
        actionSummary: "Send bulk email campaign to 5,000 subscribers",
        riskLevel: "RED" as const,
        justification: "Email campaign ready for Q1 product launch announcement. Copy approved by Perry.",
        status: "DENIED" as const,
        decidedByUserId: "jay",
        decisionReason: "Campaign copy needs legal review before mass send. Resubmit after legal signs off.",
        timeAgo: 4 * HOUR,
        estimatedCost: 12.50,
        taskIndex: 4, // NEEDS_APPROVAL task
      },
      {
        requestor: alex,
        actionType: "DEPLOY",
        actionSummary: "Deploy untested hotfix to production API server",
        riskLevel: "RED" as const,
        justification: "Hotfix for API timeout issue reported by 3 users. Quick fix, skipping staging.",
        status: "DENIED" as const,
        decidedByAgentId: sofie?._id,
        decisionReason: "Cannot skip staging for production deploys. Run through CI/CD pipeline first.",
        timeAgo: 8 * HOUR,
        estimatedCost: 0.75,
      },

      // PENDING decisions (awaiting human input)
      {
        requestor: perry,
        actionType: "CRON",
        actionSummary: "Schedule automated weekly performance reports via cron job",
        riskLevel: "RED" as const,
        justification: "Weekly reports compile agent metrics, budget usage, and task completion rates. Sends to Telegram and email.",
        status: "PENDING" as const,
        timeAgo: 30 * 60 * 1000, // 30 minutes ago
        estimatedCost: 1.00,
      },
      {
        requestor: sellerfi,
        actionType: "SHELL_EXEC",
        actionSummary: "Execute production database backup before schema migration",
        riskLevel: "YELLOW" as const,
        justification: "Pre-migration backup to S3. Standard procedure before any schema change.",
        status: "PENDING" as const,
        timeAgo: 15 * 60 * 1000, // 15 minutes ago
        estimatedCost: 0.30,
      },
    ];

    for (const cfg of approvalConfigs) {
      if (!cfg.requestor) continue;
      const taskId = cfg.taskIndex !== undefined && tasks[cfg.taskIndex]
        ? tasks[cfg.taskIndex]._id
        : undefined;

      const approvalId = await ctx.db.insert("approvals", {
        projectId,
        idempotencyKey: `council-seed:${cfg.actionSummary.slice(0, 30)}`,
        taskId,
        requestorAgentId: cfg.requestor._id,
        actionType: cfg.actionType,
        actionSummary: cfg.actionSummary,
        riskLevel: cfg.riskLevel,
        estimatedCost: cfg.estimatedCost,
        justification: cfg.justification,
        status: cfg.status,
        decidedByAgentId: cfg.decidedByAgentId,
        decidedByUserId: cfg.decidedByUserId,
        decidedAt: cfg.status !== "PENDING" ? now - cfg.timeAgo : undefined,
        decisionReason: cfg.decisionReason,
        expiresAt: now + 1 * HOUR,
      });
      approvalsCreated++;

      // Log approval activity
      if (cfg.status !== "PENDING") {
        await ctx.db.insert("activities", {
          projectId,
          actorType: cfg.decidedByUserId ? "HUMAN" : "AGENT",
          actorId: cfg.decidedByUserId ?? cfg.decidedByAgentId?.toString(),
          action: cfg.status === "APPROVED" ? "APPROVAL_APPROVED" : "APPROVAL_DENIED",
          description: `${cfg.status === "APPROVED" ? "Approved" : "Denied"}: ${cfg.actionSummary}`,
          targetType: "APPROVAL",
          targetId: approvalId,
          taskId,
          agentId: cfg.requestor._id,
        });
        activitiesCreated++;
      }
    }

    // =========================================================================
    // COORDINATOR ACTIVITIES (system-level orchestration actions)
    // =========================================================================

    const coordinatorActivities = [
      {
        action: "COORDINATOR_TASK_DECOMPOSED",
        description: "Decomposed 'Launch Q1 Marketing Campaign' into 4 subtasks: content creation, social scheduling, email sequences, analytics setup",
        timeAgo: 30 * 60 * 1000,
        taskIndex: 0,
      },
      {
        action: "COORDINATOR_DELEGATED",
        description: "Delegated 'API Documentation v2' to Casey (best match: DOCS capability, 0% budget used, ACTIVE status)",
        timeAgo: 1 * HOUR,
        taskIndex: 2,
        agentName: "Casey",
      },
      {
        action: "COORDINATOR_DELEGATED",
        description: "Delegated 'Social Media Campaign' to Jordan (best match: SOCIAL capability, low error streak, ACTIVE status)",
        timeAgo: 2 * HOUR,
        taskIndex: 3,
        agentName: "Jordan",
      },
      {
        action: "COORDINATOR_CONFLICT_RESOLVED",
        description: "Resolved resource conflict: Casey and Scribe both requested access to docs repo. Assigned to Casey (higher priority task), deferred Scribe's work.",
        timeAgo: 3 * HOUR,
        agentName: "Casey",
      },
      {
        action: "COORDINATOR_ESCALATED",
        description: "Escalated to human: Alex's Stripe integration blocked for 48+ hours. Payment API keys required from finance team.",
        timeAgo: 5 * HOUR,
        taskIndex: 5,
        agentName: "Alex",
      },
      {
        action: "COORDINATOR_REBALANCED",
        description: "Rebalanced squad: moved 2 INBOX tasks from overloaded Jordan (3 active) to available Coach (0 active)",
        timeAgo: 6 * HOUR,
      },
      {
        action: "COORDINATOR_LOOP_DETECTED",
        description: "Detected review ping-pong loop on 'Social Media Campaign': 3 review cycles between Jordan and Coach. Injecting Sofie as mediator.",
        timeAgo: 8 * HOUR,
        taskIndex: 3,
      },
      {
        action: "COORDINATOR_BUDGET_WARNING",
        description: "Budget warning: Jordan at 85% daily budget ($4.25/$5.00). Throttling new task assignment until reset.",
        timeAgo: 10 * HOUR,
        agentName: "Jordan",
      },
      {
        action: "COORDINATOR_AGENT_RECOVERED",
        description: "Agent recovery: SellerFi heartbeat restored after 5-minute gap. Error streak reset from 2 to 0. Task resumed.",
        timeAgo: 1 * DAY,
        agentName: "SellerFi",
      },
      {
        action: "COORDINATOR_STANDUP_COMPILED",
        description: "Daily standup compiled: 7/7 agents ACTIVE, 3 tasks completed, 2 in review, 1 blocked. Overall health: GREEN.",
        timeAgo: 1.2 * DAY,
      },
    ];

    for (const act of coordinatorActivities) {
      const taskId = act.taskIndex !== undefined && tasks[act.taskIndex]
        ? tasks[act.taskIndex]._id
        : undefined;
      const agent = act.agentName ? agentByName[act.agentName] : undefined;

      await ctx.db.insert("activities", {
        projectId,
        actorType: "SYSTEM",
        action: act.action,
        description: act.description,
        targetType: taskId ? "TASK" : agent ? "AGENT" : undefined,
        targetId: taskId ?? agent?._id,
        taskId,
        agentId: agent?._id,
      });
      activitiesCreated++;
    }

    return {
      message: "Council data seeded!",
      approvalsCreated,
      activitiesCreated,
    };
  },
});
