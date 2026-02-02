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
        metadata: (config as any).isCAO ? { isCAO: true, role: "Chief Agent Officer" } : undefined,
      });
      agentIds[config.name] = agentId;
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
        // CAO authority rules (disabled - using team model)
        caoAgentName: null,
        caoApprovalRequired: false,
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
