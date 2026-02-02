/**
 * Setup SellerFi Agents - Import agents from SellerFi repo
 * 
 * Run with: npx convex run setupSellerFiAgents:createSellerFiAgents
 */

import { mutation } from "./_generated/server";

export const createSellerFiAgents = mutation({
  args: {},
  handler: async (ctx) => {
    const results = [];
    
    // Get SellerFi project
    const sellerfiProject = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", "sellerfi"))
      .first();
    
    if (!sellerfiProject) {
      throw new Error("SellerFi project not found. Run setupProjects:createInitialProjects first.");
    }
    
    // Define SellerFi agents based on .claude/agents structure
    const agents = [
      {
        name: "BJ",
        role: "LEAD" as const,
        description: "Supervisor Orchestrator - Master supervisor with comprehensive knowledge of all 151+ agents, 51+ skills, and 29+ slash commands. Coordinates complex multi-agent workflows.",
        allowedTaskTypes: ["ORCHESTRATION", "PLANNING", "COORDINATION", "REVIEW", "ENGINEERING"],
        capabilities: {
          orchestration: true,
          multiAgentCoordination: true,
          slashCommands: true,
          qualityGates: true,
          riskManagement: true,
        },
        metadata: {
          agentType: "supervisor-orchestrator",
          skills: ["brainstorming", "systematic-debugging", "test-driven-development", "writing-plans"],
          slashCommands: ["/review", "/debug", "/test", "/ship", "/optimize", "/refactor"],
          automationHooks: ["auto-format", "type-check", "test-run", "ralph-wiggum"],
        },
      },
      {
        name: "Agent Organizer",
        role: "LEAD" as const,
        description: "Strategic team delegation and project analysis. Master orchestrator for complex multi-agent tasks.",
        allowedTaskTypes: ["PLANNING", "COORDINATION", "ANALYSIS"],
        capabilities: {
          teamDelegation: true,
          projectAnalysis: true,
          strategicPlanning: true,
        },
        metadata: {
          agentType: "agent-organizer",
        },
      },
      {
        name: "Context Manager",
        role: "SPECIALIST" as const,
        description: "Central nervous system for project context. Context management and project state coordination.",
        allowedTaskTypes: ["CONTEXT_MANAGEMENT", "STATE_COORDINATION"],
        capabilities: {
          contextManagement: true,
          stateCoordination: true,
        },
        metadata: {
          agentType: "context-manager",
        },
      },
      {
        name: "Tech Lead",
        role: "LEAD" as const,
        description: "Senior technical leadership for complex projects.",
        allowedTaskTypes: ["ENGINEERING", "ARCHITECTURE", "REVIEW", "PLANNING"],
        capabilities: {
          technicalLeadership: true,
          architectureDesign: true,
          codeReview: true,
        },
        metadata: {
          agentType: "tech-lead-orchestrator",
        },
      },
      {
        name: "Backend Architect",
        role: "SPECIALIST" as const,
        description: "Scalable API and server system design.",
        allowedTaskTypes: ["ENGINEERING", "ARCHITECTURE", "API_DESIGN"],
        capabilities: {
          apiDesign: true,
          systemArchitecture: true,
          scalability: true,
        },
        metadata: {
          agentType: "backend-architect",
        },
      },
      {
        name: "Frontend Developer",
        role: "SPECIALIST" as const,
        description: "User interface development with React, Next.js, and modern frontend technologies.",
        allowedTaskTypes: ["ENGINEERING", "UI_DEVELOPMENT", "CODE_CHANGE"],
        capabilities: {
          react: true,
          nextjs: true,
          typescript: true,
          uiDevelopment: true,
        },
        metadata: {
          agentType: "frontend-developer",
        },
      },
      {
        name: "Code Reviewer",
        role: "SPECIALIST" as const,
        description: "Comprehensive code review and quality assurance.",
        allowedTaskTypes: ["REVIEW", "QUALITY_ASSURANCE"],
        capabilities: {
          codeReview: true,
          qualityAssurance: true,
          bestPractices: true,
        },
        metadata: {
          agentType: "code-reviewer",
        },
      },
      {
        name: "Test Writer",
        role: "SPECIALIST" as const,
        description: "Test automation and TDD specialist.",
        allowedTaskTypes: ["TESTING", "QUALITY_ASSURANCE"],
        capabilities: {
          testAutomation: true,
          tdd: true,
          e2eTesting: true,
        },
        metadata: {
          agentType: "test-writer-fixer",
        },
      },
      {
        name: "Security Auditor",
        role: "SPECIALIST" as const,
        description: "Security audit and vulnerability scanning.",
        allowedTaskTypes: ["SECURITY", "AUDIT", "REVIEW"],
        capabilities: {
          securityAudit: true,
          vulnerabilityScanning: true,
          complianceCheck: true,
        },
        metadata: {
          agentType: "security-auditor",
        },
      },
      {
        name: "DevOps Engineer",
        role: "SPECIALIST" as const,
        description: "Infrastructure, deployment, and automation.",
        allowedTaskTypes: ["DEVOPS", "DEPLOYMENT", "INFRASTRUCTURE"],
        capabilities: {
          cicd: true,
          infrastructure: true,
          automation: true,
        },
        metadata: {
          agentType: "devops-engineer",
        },
      },
      {
        name: "Documentation Writer",
        role: "SPECIALIST" as const,
        description: "Technical documentation creation and maintenance.",
        allowedTaskTypes: ["DOCS", "DOCUMENTATION"],
        capabilities: {
          technicalWriting: true,
          apiDocumentation: true,
          userGuides: true,
        },
        metadata: {
          agentType: "documentation-writer",
        },
      },
    ];
    
    // Create agents
    for (const agentData of agents) {
      // Check if agent already exists
      const existing = await ctx.db
        .query("agents")
        .withIndex("by_project", (q) => q.eq("projectId", sellerfiProject._id))
        .filter((q) => q.eq(q.field("name"), agentData.name))
        .first();
      
      if (existing) {
        results.push({
          name: agentData.name,
          id: existing._id,
          created: false,
          message: "Already exists",
        });
        continue;
      }
      
      // Create agent
      const agentId = await ctx.db.insert("agents", {
        projectId: sellerfiProject._id,
        name: agentData.name,
        role: agentData.role,
        status: "ACTIVE",
        description: agentData.description,
        allowedTaskTypes: agentData.allowedTaskTypes,
        capabilities: agentData.capabilities,
        metadata: agentData.metadata,
        budget: {
          daily: agentData.role === "LEAD" ? 12 : 5,
          perRun: agentData.role === "LEAD" ? 1.5 : 0.75,
        },
        lastHeartbeat: Date.now(),
      });
      
      // Log activity
      await ctx.db.insert("activities", {
        actorType: "SYSTEM",
        action: "AGENT_CREATED",
        description: `Agent "${agentData.name}" created for SellerFi project`,
        targetType: "AGENT",
        targetId: agentId,
        projectId: sellerfiProject._id,
      });
      
      results.push({
        name: agentData.name,
        id: agentId,
        role: agentData.role,
        created: true,
      });
    }
    
    return {
      projectId: sellerfiProject._id,
      projectName: sellerfiProject.name,
      results,
      summary: {
        total: agents.length,
        created: results.filter(r => r.created).length,
        existing: results.filter(r => !r.created).length,
      },
    };
  },
});
