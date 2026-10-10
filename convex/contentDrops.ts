/**
 * Content Drops — Agent-submitted deliverables
 */

import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";

const contentTypeValidator = v.union(
  v.literal("BLOG_POST"),
  v.literal("SOCIAL_POST"),
  v.literal("EMAIL_DRAFT"),
  v.literal("SCRIPT"),
  v.literal("REPORT"),
  v.literal("CODE_SNIPPET"),
  v.literal("DESIGN"),
  v.literal("OTHER")
);

const statusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("SUBMITTED"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("PUBLISHED")
);

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.status) {
      const results = await ctx.db
        .query("contentDrops")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .take(limit);

      if (args.projectId) {
        return results.filter((d) => d.projectId === args.projectId);
      }
      return results;
    }

    if (args.projectId) {
      return await ctx.db
        .query("contentDrops")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("contentDrops").order("desc").take(limit);
  },
});

export const get = query({
  args: { id: v.id("contentDrops") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentDrops")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const submit = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    title: v.string(),
    contentType: contentTypeValidator,
    content: v.string(),
    summary: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const agent = args.agentId ? await ctx.db.get(args.agentId) : null;

    const id = await ctx.db.insert("contentDrops", {
      tenantId: agent?.tenantId,
      projectId: args.projectId ?? agent?.projectId,
      agentId: args.agentId,
      taskId: args.taskId,
      title: args.title,
      contentType: args.contentType,
      content: args.content,
      summary: args.summary,
      fileUrl: args.fileUrl,
      status: "SUBMITTED",
      tags: args.tags,
      metadata: args.metadata,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId ?? agent?.projectId,
      actorType: args.agentId ? "AGENT" : "HUMAN",
      actorId: args.agentId ?? undefined,
      action: "CONTENT_DROP_SUBMITTED",
      description: `Content drop "${args.title}" submitted${agent ? ` by ${agent.name}` : ""}`,
      targetType: "CONTENT_DROP",
      targetId: id,
      agentId: args.agentId,
    });

    return id;
  },
});

export const getStats = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const drops = args.projectId
      ? await ctx.db.query("contentDrops").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect()
      : await ctx.db.query("contentDrops").collect();

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const d of drops) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
      byType[d.contentType] = (byType[d.contentType] ?? 0) + 1;
    }
    return { total: drops.length, byStatus, byType };
  },
});

export const seedContentDrops = mutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const existing = args.projectId
      ? await ctx.db.query("contentDrops").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).first()
      : await ctx.db.query("contentDrops").first();
    if (existing) return { seeded: 0, message: "Already seeded" };

    const agents = args.projectId
      ? await ctx.db.query("agents").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect()
      : await ctx.db.query("agents").collect();

    const getAgent = (name: string) => agents.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));

    const drops = [
      {
        title: "Mission Control v0.9 — Product Launch Thread",
        contentType: "SOCIAL_POST" as const,
        status: "PUBLISHED" as const,
        summary: "10-tweet thread announcing Mission Control public beta to the AI/dev audience.",
        content: `1/ We built an AI agent orchestration platform in 90 days. Here's what we learned 🧵\n\n2/ Agents need a control plane. Not just a chat interface — a full operational system with approvals, state machines, and observability.\n\n3/ We built Mission Control: real-time Kanban, 8-state task lifecycle, policy-gated approvals, and a multi-agent squad framework.\n\n4/ Every task flows through: INBOX → ASSIGNED → IN_PROGRESS → REVIEW → NEEDS_APPROVAL → DONE. No shortcuts.\n\n5/ The hardest part wasn't the AI. It was the operations layer — rate limiting, idempotency, circuit breakers, audit trails.\n\n6/ Built on Convex (real-time DB + serverless), React + Tailwind, and a custom state machine package.\n\n7/ Agents can claim tasks, post artifacts, request approvals, and trigger standup reports — all through the same API.\n\n8/ The Telegram bot is the killer feature. Approve tasks, get alerts, and query agent status from your phone.\n\n9/ Open source soon. Follow @jaydubya818 for the drop.\n\n10/ What would you build with a squad of autonomous agents? Reply below 👇`,
        tags: ["launch", "twitter", "AI", "product"],
        agentName: "Jordan",
      },
      {
        title: "Why Your AI Agent Needs a State Machine (Not Just a Prompt)",
        contentType: "BLOG_POST" as const,
        status: "APPROVED" as const,
        summary: "Technical deep-dive on why production AI agents require formal state management, with code examples from Mission Control.",
        content: `# Why Your AI Agent Needs a State Machine\n\n## The Problem With Chaos\n\nMost AI agent implementations are stateless — the agent receives input, produces output, done. This works fine for demos. It fails catastrophically in production.\n\nWhen an agent can be in any state at any time, bugs compound. A task that was "in review" gets re-processed. An approval that was denied gets re-attempted. An agent claims a task that's already done.\n\n## The Solution: 8-State Lifecycle\n\nMission Control enforces every task through a formal state machine:\n\n\`\`\`\nINBOX → ASSIGNED → IN_PROGRESS → REVIEW → NEEDS_APPROVAL → DONE\n                                               ↘ BLOCKED\n                                               ↘ CANCELED\n\`\`\`\n\n## Why This Matters\n\n1. **Idempotency**: Same operation, same result. No duplicate task claims.\n2. **Auditability**: Every transition is logged with actor, timestamp, and reason.\n3. **Policy gates**: Certain transitions (REVIEW → DONE) require human approval.\n4. **Agent coordination**: Multiple agents can collaborate without stepping on each other.\n\n## Implementation\n\n\`\`\`typescript\n// packages/state-machine\nexport function validateTransition(from: TaskStatus, to: TaskStatus): boolean {\n  const allowed = TRANSITIONS[from];\n  return allowed?.includes(to) ?? false;\n}\n\`\`\`\n\nThe key insight: **never let agents transition tasks directly**. All transitions go through the validator, which enforces the rules.\n\n## Conclusion\n\nIf you're building production AI agents, a state machine isn't optional — it's the foundation everything else rests on.`,
        tags: ["engineering", "ai", "state-machine", "blog"],
        agentName: "Scribe",
      },
      {
        title: "Weekly Agent Performance Report — Week 12",
        contentType: "REPORT" as const,
        status: "SUBMITTED" as const,
        summary: "Weekly performance metrics across all active agents: task completion rates, approval rates, error frequencies.",
        content: `# Weekly Agent Performance Report\n**Period:** Week 12, 2026\n\n## Executive Summary\n\nThe squad completed 34 tasks this week (↑18% vs last week). Approval rate held at 94%. One incident: Jordan's social post flagged for tone review.\n\n## Agent Metrics\n\n| Agent | Tasks Done | Approval Rate | Avg Duration | Errors |\n|-------|-----------|---------------|--------------|--------|\n| Sofie (CAO) | 8 | 100% | 2.3h | 0 |\n| Jordan (Content) | 12 | 91% | 1.8h | 1 |\n| Scout (Research) | 9 | 100% | 3.1h | 0 |\n| Scribe (Docs) | 5 | 100% | 4.2h | 0 |\n\n## Highlights\n\n- **Best performer**: Scout — 9/9 tasks approved on first submission\n- **Most productive**: Jordan — 12 content pieces delivered\n- **Incident**: Jordan's LinkedIn post flagged for competitive brand mention (resolved)\n\n## Recommendations\n\n1. Add brand mention check to Jordan's content policy\n2. Increase Scout's task allocation (high output quality)\n3. Sofie review cadence working well — maintain current frequency\n\n## Next Week Goals\n\n- 40+ tasks completed\n- Zero policy incidents\n- Launch blog post pipeline`,
        tags: ["report", "metrics", "weekly"],
        agentName: "Sofie",
      },
      {
        title: "Mission Control × SellerFi Integration — Technical Spec",
        contentType: "REPORT" as const,
        status: "DRAFT" as const,
        summary: "Architecture spec for integrating Mission Control agent squad with SellerFi's ecommerce data pipeline.",
        content: `# MC × SellerFi Integration Spec\n\n## Overview\n\nThis document outlines the technical architecture for deploying a Mission Control agent squad within SellerFi's operational infrastructure.\n\n## Agent Roles\n\n### Data Scout Agent\n- Monitors Shopify/Amazon sales feeds in real-time\n- Surfaces anomalies (sudden drops, SKU stockouts, refund spikes)\n- Posts findings to INBOX as RESEARCH tasks\n\n### Content Agent\n- Generates product descriptions, ad copy, email sequences\n- Pulls from SellerFi brand guidelines and product catalog\n- Submits all outputs as content drops for human review\n\n### Analytics Agent\n- Weekly P&L attribution reports\n- ROAS tracking across ad platforms\n- Forecast modeling using historical data\n\n## Integration Points\n\n\`\`\`\nSellerFi API → Convex webhook → INBOX task creation → Agent claim → Deliverable\n\`\`\`\n\n## Data Flow\n\n1. SellerFi event fires (order, refund, campaign metric)\n2. Convex HTTP endpoint receives webhook\n3. Task created in INBOX with context payload\n4. Assigned agent claims and processes\n5. Deliverable submitted as content drop\n6. Human reviews and approves/rejects\n\n## Timeline\n\n- Week 1: Webhook infrastructure + agent registration\n- Week 2: Data Scout agent live\n- Week 3: Content agent + review workflow\n- Week 4: Analytics agent + dashboard integration`,
        tags: ["integration", "sellerfi", "technical", "spec"],
        agentName: "Scout",
      },
      {
        title: "5 Prompting Patterns That Cut Agent Error Rates by 40%",
        contentType: "BLOG_POST" as const,
        status: "SUBMITTED" as const,
        summary: "Practical prompting techniques we discovered while building Mission Control that dramatically reduced agent mistakes.",
        content: `# 5 Prompting Patterns That Cut Agent Error Rates by 40%\n\nAfter running thousands of agent tasks through Mission Control, we identified five prompting patterns that consistently produce better outputs with fewer corrections needed.\n\n## 1. State Injection\n\nAlways inject the current system state into the agent's context. Don't make the agent infer context — give it facts.\n\n**Before:** "Write a status update for the project."\n**After:** "The project has 12 DONE tasks, 3 IN_PROGRESS, and 2 BLOCKED. Write a 2-paragraph status update."\n\n## 2. Constraint-First Prompting\n\nLead with constraints, not goals. Agents optimize for the goal unless you make constraints explicit.\n\n**Before:** "Write a tweet about our product launch."\n**After:** "Write a tweet (max 280 chars, no competitor mentions, no emoji except ✅ and 🚀) about our Mission Control beta launch."\n\n## 3. Output Format Specification\n\nAlways specify the exact output format. JSON, Markdown, prose — be explicit.\n\n## 4. Example-Driven Tasks\n\nProvide one example of a good output. Agents calibrate to examples better than descriptions.\n\n## 5. Failure Mode Enumeration\n\nTell the agent what NOT to do. Enumerating failure modes reduces them.\n\n## Results\n\nAfter implementing all five patterns across our squad: approval-on-first-submission rate went from 61% to 94%.`,
        tags: ["prompting", "ai", "engineering", "blog"],
        agentName: "Scribe",
      },
      {
        title: "LinkedIn Carousel: Building With AI Agents in 2026",
        contentType: "SOCIAL_POST" as const,
        status: "REJECTED" as const,
        summary: "7-slide LinkedIn carousel on building production AI agent systems. Rejected: competitive brand mention on slide 3.",
        content: `Slide 1: Building with AI Agents in 2026 — What Actually Works\n\nSlide 2: Everyone's building chatbots. Smart operators are building agent squads.\n\nSlide 3: [FLAGGED] Unlike OpenAI's Operator product, Mission Control gives you full control over every agent decision.\n\nSlide 4: The key insight: agents need operations infrastructure, not just good prompts.\n\nSlide 5: State machines. Approval gates. Budget controls. Audit trails. That's the real stack.\n\nSlide 6: We're running 4 agents simultaneously. Zero incidents. 94% first-submission approval rate.\n\nSlide 7: What would you build? Drop your answer below 👇`,
        tags: ["linkedin", "carousel", "ai"],
        agentName: "Jordan",
      },
      {
        title: "Telegram Bot Setup Guide — Internal Ops Manual",
        contentType: "REPORT" as const,
        status: "PUBLISHED" as const,
        summary: "Step-by-step guide for configuring the Mission Control Telegram bot for agent notifications and approvals.",
        content: `# Telegram Bot Setup Guide\n\n## Prerequisites\n\n- Mission Control deployed to Convex\n- Telegram account\n- BotFather access\n\n## Step 1: Create Bot\n\n1. Open Telegram, search @BotFather\n2. Send /newbot\n3. Name: "Mission Control Bot"\n4. Username: @missioncontrol_ops_bot\n5. Copy the API token\n\n## Step 2: Configure Convex\n\nIn your Convex dashboard, set environment variables:\n\`\`\`\nTELEGRAM_BOT_TOKEN=your_token_here\nTELEGRAM_CHAT_ID=your_chat_id\n\`\`\`\n\n## Step 3: Set Webhook\n\n\`\`\`bash\ncurl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook \\\n  -d "url=https://your-convex-url.convex.site/telegram"\n\`\`\`\n\n## Commands\n\n- /status — Current agent status\n- /approve {id} — Approve pending task\n- /deny {id} — Deny pending task\n- /tasks — List INBOX tasks\n- /standup — Generate squad standup\n\n## Notifications\n\nThe bot will automatically notify you when:\n- Task requires approval (NEEDS_APPROVAL)\n- Agent reports an error\n- Budget threshold exceeded\n- Daily standup ready`,
        tags: ["telegram", "setup", "ops", "guide"],
        agentName: "Scribe",
      },
      {
        title: "Cold Email Sequence: AI Operations Platform (5-Email Series)",
        contentType: "EMAIL_DRAFT" as const,
        status: "APPROVED" as const,
        summary: "5-email cold outreach sequence targeting CTOs and Head of Engineering at Series A-C startups.",
        content: `Email 1 — Day 0 (Initial Outreach)\nSubject: your engineering team + AI agents\n\nHi {{first_name}},\n\nQuick question: does your team spend more than 2 hours/week on repetitive ops tasks?\n\nWe built Mission Control for exactly this. It's a control plane for autonomous AI agent squads — not another chatbot, but full operational infrastructure with approval workflows, state machines, and real-time observability.\n\nWorth a 20-min call?\n\n---\nEmail 2 — Day 3 (Social Proof)\nSubject: 34 tasks/week, zero incidents\n\nFollowing up — wanted to share a quick win.\n\nOur squad completed 34 autonomous tasks last week with a 94% first-pass approval rate and zero policy incidents. That's 4 agents running in parallel, each with scoped permissions and budget controls.\n\nHappy to walk you through the architecture.\n\n---\nEmail 3 — Day 7 (Use Case)\nSubject: the use case that always resonates\n\nMost CTOs I talk to immediately see this use case:\n\nAgent monitors your Slack/Linear/Jira → surfaces blockers → drafts updates → requests approval → posts to stakeholders.\n\nNo more status meeting prep. No more manual reporting.\n\n---\nEmail 4 — Day 14 (Technical)\nSubject: re: the state machine question\n\nA few people have asked how we handle agent coordination without conflicts.\n\nShort answer: 8-state lifecycle + idempotency keys. Every task transition is validated, logged, and gated. Agents can't step on each other.\n\n---\nEmail 5 — Day 21 (Breakup)\nSubject: closing the loop\n\nHi {{first_name}}, closing the loop on this.\n\nIf the timing's off, no worries — I'll check back in Q3. If you're actively exploring AI ops infrastructure, happy to do a quick demo.\n\nEither way, best of luck with {{company}}.`,
        tags: ["email", "outreach", "sales"],
        agentName: "Jordan",
      },
    ];

    let seeded = 0;
    for (const drop of drops) {
      const agent = drop.agentName ? getAgent(drop.agentName) : null;
      await ctx.db.insert("contentDrops", {
        projectId: args.projectId,
        agentId: agent?._id,
        title: drop.title,
        contentType: drop.contentType,
        content: drop.content,
        summary: drop.summary,
        status: drop.status,
        tags: drop.tags,
        reviewedBy: ["APPROVED", "REJECTED", "PUBLISHED"].includes(drop.status) ? "operator" : undefined,
        reviewedAt: ["APPROVED", "REJECTED", "PUBLISHED"].includes(drop.status) ? Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000 : undefined,
        reviewNote: drop.status === "REJECTED" ? "Contains competitive brand mention — please revise slide 3." : undefined,
      });
      seeded++;
    }
    return { seeded };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("contentDrops"),
    status: statusValidator,
    reviewedBy: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const drop = await ctx.db.get(args.id);
    if (!drop) throw new Error("Content drop not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      reviewedBy: args.reviewedBy,
      reviewedAt: Date.now(),
      reviewNote: args.reviewNote,
    });

    await ctx.db.insert("activities", {
      projectId: drop.projectId,
      actorType: "HUMAN",
      actorId: args.reviewedBy,
      action: `CONTENT_DROP_${args.status}`,
      description: `Content drop "${drop.title}" marked as ${args.status.toLowerCase()}`,
      targetType: "CONTENT_DROP",
      targetId: args.id,
      agentId: drop.agentId,
    });

    return await ctx.db.get(args.id);
  },
});
