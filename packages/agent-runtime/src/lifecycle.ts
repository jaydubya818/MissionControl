/**
 * Agent Lifecycle Manager
 * 
 * Manages the full lifecycle of an agent instance:
 *   1. Load persona from YAML
 *   2. Register with Convex
 *   3. Initialize memory system (3-tier)
 *   4. Start heartbeat loop
 *   5. Claim and execute tasks
 *   6. Handle errors and recovery
 *   7. Graceful shutdown
 */

import { ConvexHttpClient } from "convex/browser";
import { AgentPersona, loadPersona } from "./persona";
import { HeartbeatMonitor, HeartbeatConfig } from "./heartbeat";
import { MemoryManager } from "@mission-control/memory";

export interface AgentLifecycleConfig {
  personaPath: string;
  convexUrl: string;
  projectSlug: string;
  heartbeatIntervalMs?: number;
  errorQuarantineThreshold?: number;
}

export class AgentLifecycle {
  private persona: AgentPersona;
  private client: ConvexHttpClient;
  private agentId: string | null = null;
  private projectId: string | null = null;
  private heartbeat: HeartbeatMonitor | null = null;
  private memory: MemoryManager | null = null;
  private running = false;
  private config: AgentLifecycleConfig;
  
  constructor(config: AgentLifecycleConfig) {
    this.config = config;
    this.persona = loadPersona(config.personaPath);
    this.client = new ConvexHttpClient(config.convexUrl);
  }
  
  /**
   * Get the loaded persona.
   */
  getPersona(): AgentPersona {
    return this.persona;
  }
  
  /**
   * Get the Convex client.
   */
  getClient(): ConvexHttpClient {
    return this.client;
  }
  
  /**
   * Get the registered agent ID.
   */
  getAgentId(): string | null {
    return this.agentId;
  }
  
  /**
   * Check if the lifecycle is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }
  
  /**
   * Start the agent lifecycle.
   * 
   * 1. Resolves the project by slug
   * 2. Registers (or re-registers) the agent with Convex
   * 3. Starts the heartbeat loop
   */
  async start(api: any): Promise<void> {
    if (this.running) {
      throw new Error(`Agent ${this.persona.name} is already running`);
    }
    
    // 1. Resolve project
    const project = await this.client.query(api.projects.getBySlug, {
      slug: this.config.projectSlug,
    });
    
    if (!project) {
      throw new Error(`Project "${this.config.projectSlug}" not found`);
    }
    
    this.projectId = project._id;
    
    // 2. Register agent
    const result = await this.client.mutation(api.agents.register, {
      projectId: project._id,
      name: this.persona.name,
      emoji: this.persona.emoji,
      role: this.persona.role,
      workspacePath: `/tmp/mc-agent-${this.persona.name.toLowerCase()}`,
      allowedTaskTypes: this.persona.allowed_task_types,
      allowedTools: this.persona.allowed_tools,
      budgetDaily: this.persona.budgets.daily_cap,
      budgetPerRun: this.persona.budgets.per_run_cap,
    });
    
    const agent = (result as any).agent;
    this.agentId = agent._id;
    this.running = true;
    
    console.log(`[${this.persona.name}] Registered: ${this.agentId} (Project: ${project.name})`);
    
    // 3. Start heartbeat
    const heartbeatConfig: HeartbeatConfig = {
      agentId: this.agentId!,
      client: this.client,
      api,
      intervalMs: this.config.heartbeatIntervalMs ?? 30_000,
      quarantineThreshold: this.config.errorQuarantineThreshold ?? 5,
      agentName: this.persona.name,
    };
    
    this.heartbeat = new HeartbeatMonitor(heartbeatConfig);
    await this.heartbeat.start();
    
    console.log(`[${this.persona.name}] Heartbeat started (every ${heartbeatConfig.intervalMs / 1000}s)`);
    
    // 4. Initialize memory system (3-tier)
    this.memory = new MemoryManager({
      agentId: this.agentId!,
      projectId: this.projectId!,
    });
    
    // Load stored memory from Convex
    try {
      const [workingDoc, dailyNote, performance, patterns] = await Promise.all([
        this.client.query(api.agentDocuments?.getByType ?? (() => null), {
          agentId: this.agentId!,
          type: "WORKING_MD",
        }).catch(() => null),
        this.client.query(api.agentDocuments?.getByType ?? (() => null), {
          agentId: this.agentId!,
          type: "DAILY_NOTE",
        }).catch(() => null),
        this.client.query(api.agentLearning?.getAgentPerformance ?? (() => null), {
          agentId: this.agentId!,
        }).catch(() => null),
        this.client.query(api.agentLearning?.getAgentStrengths ?? (() => null), {
          agentId: this.agentId!,
        }).catch(() => null),
      ]);
      
      this.memory.initialize({
        workingDoc: workingDoc?.content,
        dailyNote: dailyNote?.content,
        performance: performance?.byType
          ? Object.entries(performance.byType).map(([taskType, data]: [string, any]) => ({
              agentId: this.agentId!,
              taskType,
              successCount: data.completed ?? 0,
              failureCount: data.failed ?? 0,
              avgCompletionTimeMs: 0,
              avgCostUsd: data.avgCost ?? 0,
              totalTasksCompleted: (data.completed ?? 0) + (data.failed ?? 0),
            }))
          : [],
        patterns: patterns
          ? patterns.map((p: any) => ({
              agentId: this.agentId!,
              pattern: `strength:${p.type}`,
              confidence: p.score,
              evidence: p.evidence ?? [],
            }))
          : [],
      });
      
      console.log(`[${this.persona.name}] Memory initialized (3-tier)`);
    } catch (err) {
      console.warn(`[${this.persona.name}] Memory initialization partial:`, err);
    }
  }
  
  /**
   * Get the memory manager for this agent.
   */
  getMemory(): MemoryManager | null {
    return this.memory;
  }
  
  /**
   * Build task context from memory before starting a task.
   */
  buildTaskContext(taskType: string): string {
    if (!this.memory) return "";
    return this.memory.buildTaskContext(taskType);
  }
  
  /**
   * Start working on a task — initializes session memory.
   */
  startTask(taskId: string): void {
    if (this.memory) {
      this.memory.startTask(taskId);
    }
  }
  
  /**
   * End a task — records session and updates memory.
   * Returns the session summary for persistence to Convex.
   */
  async endTask(
    api: any,
    taskId: string,
    success: boolean,
    costUsd?: number,
    completionTimeMs?: number
  ): Promise<void> {
    // 1. End memory session
    if (this.memory) {
      const result = this.memory.endTask(success);
      
      // 2. Persist session memory to Convex
      try {
        await this.client.mutation(api.agentDocuments?.upsert ?? (() => null), {
          agentId: this.agentId!,
          type: "SESSION_MEMORY",
          content: result.sessionSummary,
        }).catch(() => {});
        
        await this.client.mutation(api.agentDocuments?.upsert ?? (() => null), {
          agentId: this.agentId!,
          type: "DAILY_NOTE",
          content: result.dailyNote,
        }).catch(() => {});
      } catch {
        // Non-critical: log and continue
      }
    }
    
    // 3. Record task completion in learning system
    try {
      await this.client.mutation(api.agentLearning.recordTaskCompletion, {
        taskId,
        success,
        completionTimeMs,
        costUsd,
      });
    } catch (err) {
      console.warn(`[${this.persona.name}] Failed to record task completion:`, err);
    }
  }
  
  /**
   * Stop the agent lifecycle gracefully.
   */
  async stop(api: any): Promise<void> {
    if (!this.running) return;
    
    console.log(`[${this.persona.name}] Shutting down...`);
    
    // Stop heartbeat
    if (this.heartbeat) {
      this.heartbeat.stop();
      this.heartbeat = null;
    }
    
    // Update agent status to OFFLINE
    if (this.agentId) {
      try {
        await this.client.mutation(api.agents.updateStatus, {
          agentId: this.agentId,
          status: "OFFLINE",
          reason: "Graceful shutdown",
        });
      } catch (err) {
        console.error(`[${this.persona.name}] Failed to update status on shutdown:`, err);
      }
    }
    
    this.running = false;
    console.log(`[${this.persona.name}] Stopped.`);
  }
}
