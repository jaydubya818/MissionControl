/**
 * Seed Memory Data — session docs, patterns, agent memories, knowledge base
 * Run: npx convex run seedMemory:run
 */

import { mutation } from "./_generated/server";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // Find the Mission Control project (or any project)
    let project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "mission-control"))
      .first();
    if (!project) {
      project = await ctx.db.query("projects").first();
    }
    if (!project) {
      return { error: "No project found. Run seed first." };
    }
    const projectId = project._id;

    // Get agents for this project
    let agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();

    // Fallback: get all agents
    if (agents.length === 0) {
      agents = await ctx.db.query("agents").take(6);
    }
    if (agents.length === 0) {
      return { error: "No agents found. Run seed first." };
    }

    const now = Date.now();
    const hour = 3600_000;
    const day = 86400_000;

    // =========================================================================
    // SESSION MEMORY (3 entries)
    // =========================================================================
    const sessionDocs = [
      {
        agentId: agents[0]._id,
        projectId,
        type: "SESSION_MEMORY" as const,
        content:
          "Completed initial research on competitor pricing models. Found 3 key patterns:\n1. Tiered pricing with usage caps\n2. Per-seat licensing for enterprise\n3. Freemium with feature gates\n\nRecommend hybrid approach for SellerFi.",
        updatedAt: now - 2 * hour,
      },
      {
        agentId: agents[Math.min(1, agents.length - 1)]._id,
        projectId,
        type: "SESSION_MEMORY" as const,
        content:
          "Drafted 3 blog post outlines for the content calendar:\n- \"5 Signs You're Ready for Seller Financing\"\n- \"How AI is Changing Small Business Lending\"\n- \"Seller Financing vs Traditional Bank Loans: A Comparison\"\n\nFirst draft of post #1 is in progress.",
        updatedAt: now - 45 * 60_000,
      },
      {
        agentId: agents[Math.min(2, agents.length - 1)]._id,
        projectId,
        type: "SESSION_MEMORY" as const,
        content:
          "Reviewed PR #47 — authentication refactor. Found 2 issues:\n1. JWT refresh token rotation not implemented\n2. Missing rate limiting on login endpoint\n\nLeft detailed comments. Waiting for author to address.",
        updatedAt: now - 15 * 60_000,
      },
    ];

    for (const doc of sessionDocs) {
      await ctx.db.insert("agentDocuments", doc);
    }

    // =========================================================================
    // WORKING_MD / KNOWLEDGE BASE (3 entries)
    // =========================================================================
    const workingDocs = [
      {
        agentId: agents[0]._id,
        projectId,
        type: "WORKING_MD" as const,
        content:
          "# Current Focus\n\n## Active Work\n- Market research for Q1 strategy\n- Competitive analysis document\n- Pricing model recommendations\n\n## Blockers\n- Waiting on financial data from finance team\n\n## Notes\n- Meeting with stakeholders scheduled for Thursday\n- Need to align pricing with brand positioning",
        updatedAt: now - 6 * hour,
      },
      {
        agentId: agents[Math.min(1, agents.length - 1)]._id,
        projectId,
        type: "WORKING_MD" as const,
        content:
          "# Content Pipeline\n\n## Published This Week\n- LinkedIn post: AI in Finance (342 impressions)\n- Blog: Getting Started Guide (89 views)\n\n## In Progress\n- Email sequence for onboarding flow (3/5 emails done)\n- Social media calendar for February\n\n## Ideas Backlog\n- Video explainer for seller financing\n- Case study with early adopter",
        updatedAt: now - 3 * hour,
      },
      {
        agentId: agents[Math.min(3, agents.length - 1)]._id,
        projectId,
        type: "WORKING_MD" as const,
        content:
          "# Engineering Log\n\n## Recent Changes\n- Migrated auth to Clerk (PR #42)\n- Added Stripe webhook handlers\n- Fixed N+1 query in dashboard loader\n\n## Tech Debt\n- Need to add integration tests for payment flow\n- Refactor notification service to use queue\n- Database indexes for search queries\n\n## Architecture Decisions\n- Chose Convex over Supabase for real-time features\n- Using Edge Functions for webhook processing",
        updatedAt: now - 1 * hour,
      },
    ];

    for (const doc of workingDocs) {
      await ctx.db.insert("agentDocuments", doc);
    }

    // =========================================================================
    // DAILY NOTES (Agent Memories — 4 entries)
    // =========================================================================
    const dailyNotes = [
      {
        agentId: agents[0]._id,
        projectId,
        type: "DAILY_NOTE" as const,
        content:
          "Feb 7: Completed competitor analysis for 5 platforms. Key takeaway — most competitors lack AI-driven risk assessment. This is our differentiator.\n\nTomorrow: Start drafting the pricing recommendation doc.",
        updatedAt: now - 1 * day,
      },
      {
        agentId: agents[Math.min(1, agents.length - 1)]._id,
        projectId,
        type: "DAILY_NOTE" as const,
        content:
          "Feb 8: Published the onboarding email sequence. Open rate projections: 35-40% based on industry benchmarks.\n\nScheduled 4 social posts for next week. Need approval on the LinkedIn ad copy.",
        updatedAt: now - 2 * hour,
      },
      {
        agentId: agents[Math.min(2, agents.length - 1)]._id,
        projectId,
        type: "DAILY_NOTE" as const,
        content:
          "Feb 8: Reviewed 3 PRs today. Code quality is improving — fewer linting issues and better test coverage.\n\nNoticed a potential security issue in the file upload handler. Created a YELLOW risk ticket.",
        updatedAt: now - 4 * hour,
      },
      {
        agentId: agents[Math.min(3, agents.length - 1)]._id,
        projectId,
        type: "DAILY_NOTE" as const,
        content:
          "Feb 7: Deployed hotfix for the payment calculation rounding error. All tests passing. Monitoring for 24h before closing the incident.\n\nStarted spike on WebSocket integration for real-time notifications.",
        updatedAt: now - 1 * day + 8 * hour,
      },
    ];

    for (const doc of dailyNotes) {
      await ctx.db.insert("agentDocuments", doc);
    }

    // =========================================================================
    // AGENT PATTERNS (6 entries)
    // =========================================================================
    const patterns = [
      {
        agentId: agents[0]._id,
        projectId,
        pattern: "strength:market-research",
        confidence: 0.92,
        evidence: [
          "Completed competitor analysis in 2 hours",
          "Identified 3 pricing strategies",
          "Accurate market size estimates",
        ],
        discoveredAt: now - 5 * day,
        lastSeenAt: now - 2 * hour,
      },
      {
        agentId: agents[Math.min(1, agents.length - 1)]._id,
        projectId,
        pattern: "strength:content-writing",
        confidence: 0.87,
        evidence: [
          "Blog posts consistently above 80 readability score",
          "Email sequences with 38% open rate",
          "Social posts with above-average engagement",
        ],
        discoveredAt: now - 10 * day,
        lastSeenAt: now - 1 * day,
      },
      {
        agentId: agents[Math.min(2, agents.length - 1)]._id,
        projectId,
        pattern: "strength:code-review",
        confidence: 0.85,
        evidence: [
          "Caught security vulnerability in PR #47",
          "Identified N+1 query pattern",
          "Consistent review turnaround under 30 min",
        ],
        discoveredAt: now - 7 * day,
        lastSeenAt: now - 4 * hour,
      },
      {
        agentId: agents[0]._id,
        projectId,
        pattern: "weakness:technical-implementation",
        confidence: 0.45,
        evidence: [
          "Required 3 iterations on API integration task",
          "Missed edge case in data validation",
        ],
        discoveredAt: now - 3 * day,
        lastSeenAt: now - 1 * day,
      },
      {
        agentId: agents[Math.min(1, agents.length - 1)]._id,
        projectId,
        pattern: "preference:morning-productivity",
        confidence: 0.78,
        evidence: [
          "80% of high-quality outputs produced before noon",
          "Task completion rate 40% higher in AM sessions",
        ],
        discoveredAt: now - 14 * day,
        lastSeenAt: now - 2 * day,
      },
      {
        agentId: agents[Math.min(3, agents.length - 1)]._id,
        projectId,
        pattern: "strength:debugging",
        confidence: 0.91,
        evidence: [
          "Resolved payment rounding bug in 15 minutes",
          "Traced WebSocket connection leak to root cause",
          "Fixed race condition in task queue processor",
          "Identified memory leak in long-running process",
        ],
        discoveredAt: now - 12 * day,
        lastSeenAt: now - 6 * hour,
      },
    ];

    for (const p of patterns) {
      await ctx.db.insert("agentPatterns", p);
    }

    return {
      success: true,
      project: project.name,
      seeded: {
        sessionMemories: sessionDocs.length,
        workingDocs: workingDocs.length,
        dailyNotes: dailyNotes.length,
        patterns: patterns.length,
      },
    };
  },
});
