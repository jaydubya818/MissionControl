/**
 * Memory Manager
 * 
 * Orchestrates all three memory tiers for an agent.
 * Provides a unified interface for reading and writing memory.
 */

import { SessionMemory } from "./session";
import { ProjectMemory } from "./project";
import { GlobalMemory, PerformanceRecord, PatternRecord } from "./global";

export interface MemoryConfig {
  agentId: string;
  projectId: string;
  maxSessionEntries?: number;
}

export class MemoryManager {
  readonly session: SessionMemory;
  readonly project: ProjectMemory;
  readonly global: GlobalMemory;
  
  private config: MemoryConfig;
  
  constructor(config: MemoryConfig) {
    this.config = config;
    this.session = new SessionMemory(config.agentId, config.maxSessionEntries);
    this.project = new ProjectMemory(config.agentId, config.projectId);
    this.global = new GlobalMemory();
  }
  
  /**
   * Initialize memory from stored data.
   * Call this after constructing with data fetched from Convex.
   */
  initialize(data: {
    workingDoc?: string;
    dailyNote?: string;
    performance?: PerformanceRecord[];
    patterns?: PatternRecord[];
  }): void {
    if (data.workingDoc) {
      this.project.loadWorkingDoc(data.workingDoc);
    }
    if (data.dailyNote) {
      this.project.loadDailyNote(data.dailyNote);
    }
    if (data.performance) {
      this.global.loadPerformance(data.performance);
    }
    if (data.patterns) {
      this.global.loadPatterns(data.patterns);
    }
  }
  
  /**
   * Start a new task session.
   */
  startTask(taskId: string): void {
    this.session.startSession(taskId);
    this.session.add("note", `Task started: ${taskId}`);
    this.project.addDailyEntry("TASK_STARTED", `Started task ${taskId}`);
  }
  
  /**
   * End the current task session.
   * Returns the session summary for persistence.
   */
  endTask(success: boolean): {
    sessionSummary: string;
    dailyNote: string;
    sessionStats: ReturnType<SessionMemory["stats"]>;
  } {
    const taskId = this.session.getTaskId();
    const stats = this.session.stats();
    
    this.session.add(
      "note",
      `Task ${success ? "completed successfully" : "failed"}`
    );
    
    this.project.addDailyEntry(
      success ? "TASK_COMPLETED" : "TASK_FAILED",
      `${success ? "Completed" : "Failed"} task ${taskId} (${stats.entryCount} entries, ${stats.errorCount} errors)`
    );
    
    const sessionSummary = this.session.serialize();
    const dailyNote = this.project.getDailyNoteContent();
    
    // Clear session memory
    this.session.clear();
    
    return { sessionSummary, dailyNote, sessionStats: stats };
  }
  
  /**
   * Build context for an agent about to start a task.
   * Combines relevant memory from all three tiers.
   */
  buildTaskContext(taskType: string): string {
    const parts: string[] = [];
    
    // Tier 2: Project context from WORKING.md
    const workingDoc = this.project.getWorkingDoc();
    if (workingDoc) {
      parts.push("# Project Context (WORKING.md)\n");
      parts.push(workingDoc);
      parts.push("\n---\n");
    }
    
    // Tier 3: Historical performance for this task type
    const estimate = this.global.estimateTask(taskType);
    if (estimate.sampleSize > 0) {
      parts.push("# Historical Performance\n");
      parts.push(`- Task type: ${taskType}`);
      parts.push(`- Estimated cost: $${estimate.estimatedCostUsd.toFixed(2)}`);
      parts.push(
        `- Estimated time: ${Math.round(estimate.estimatedTimeMs / 60000)} minutes`
      );
      parts.push(
        `- Confidence: ${(estimate.confidence * 100).toFixed(0)}% (${estimate.sampleSize} samples)`
      );
      parts.push("\n---\n");
    }
    
    // Tier 3: Agent profile
    const profile = this.global.getAgentProfile(this.config.agentId);
    if (profile.totalTasks > 0) {
      parts.push("# Your Profile\n");
      parts.push(
        `- Overall success rate: ${(profile.overallSuccessRate * 100).toFixed(0)}%`
      );
      if (profile.strengths.length > 0) {
        parts.push(`- Strengths: ${profile.strengths.join(", ")}`);
      }
      if (profile.weaknesses.length > 0) {
        parts.push(`- Areas to improve: ${profile.weaknesses.join(", ")}`);
      }
    }
    
    return parts.join("\n");
  }
}
