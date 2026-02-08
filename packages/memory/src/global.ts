/**
 * Global Memory — Tier 3
 * 
 * Long-lived, cross-project learning.
 * Aggregates agent performance metrics and discovered patterns
 * across all projects. Used for:
 *   - Task routing (which agent is best for this type?)
 *   - Budget estimation (how much will this cost?)
 *   - Risk assessment (how likely is this to fail?)
 *   - Pattern recognition (what approaches work best?)
 */

export interface PerformanceRecord {
  agentId: string;
  taskType: string;
  successCount: number;
  failureCount: number;
  avgCompletionTimeMs: number;
  avgCostUsd: number;
  totalTasksCompleted: number;
}

export interface PatternRecord {
  agentId: string;
  pattern: string;
  confidence: number;
  evidence: string[];
  discoveredAt: number;
  lastSeenAt: number;
}

export interface AgentProfile {
  agentId: string;
  overallSuccessRate: number;
  totalTasks: number;
  totalCost: number;
  strengths: string[];
  weaknesses: string[];
  bestTaskTypes: string[];
  worstTaskTypes: string[];
}

export class GlobalMemory {
  private performanceRecords: PerformanceRecord[] = [];
  private patterns: PatternRecord[] = [];
  
  /**
   * Load performance data (typically from Convex query results).
   */
  loadPerformance(records: PerformanceRecord[]): void {
    this.performanceRecords = records;
  }
  
  /**
   * Load pattern data (typically from Convex query results).
   */
  loadPatterns(patterns: PatternRecord[]): void {
    this.patterns = patterns;
  }
  
  /**
   * Get a full agent profile combining performance and patterns.
   */
  getAgentProfile(agentId: string): AgentProfile {
    const agentPerf = this.performanceRecords.filter(
      (r) => r.agentId === agentId
    );
    const agentPatterns = this.patterns.filter(
      (p) => p.agentId === agentId
    );
    
    const totalSuccess = agentPerf.reduce((s, r) => s + r.successCount, 0);
    const totalFailure = agentPerf.reduce((s, r) => s + r.failureCount, 0);
    const totalTasks = totalSuccess + totalFailure;
    const totalCost = agentPerf.reduce(
      (s, r) => s + r.avgCostUsd * r.totalTasksCompleted,
      0
    );
    
    // Find best and worst task types by success rate
    const typeRates = agentPerf
      .filter((r) => r.totalTasksCompleted >= 2) // Need at least 2 tasks
      .map((r) => {
        const total = r.successCount + r.failureCount;
        return {
          type: r.taskType,
          rate: total > 0 ? r.successCount / total : 0, // Prevent division by zero
        };
      })
      .sort((a, b) => b.rate - a.rate);
    
    const bestTypes = typeRates
      .filter((t) => t.rate >= 0.7)
      .map((t) => t.type);
    const worstTypes = typeRates
      .filter((t) => t.rate < 0.5)
      .map((t) => t.type);
    
    // Extract strengths and weaknesses from patterns
    const strengths = agentPatterns
      .filter((p) => p.pattern.startsWith("strength:") && p.confidence >= 0.6)
      .map((p) => p.pattern.replace("strength:", ""));
    const weaknesses = agentPatterns
      .filter((p) => p.pattern.startsWith("weakness:") && p.confidence >= 0.6)
      .map((p) => p.pattern.replace("weakness:", ""));
    
    return {
      agentId,
      overallSuccessRate: totalTasks > 0 ? totalSuccess / totalTasks : 0,
      totalTasks,
      totalCost,
      strengths,
      weaknesses,
      bestTaskTypes: bestTypes,
      worstTaskTypes: worstTypes,
    };
  }
  
  /**
   * Rank agents for a specific task type.
   * Returns agents sorted by expected success rate for this type.
   */
  rankAgentsForType(taskType: string): Array<{
    agentId: string;
    score: number;
    reason: string;
  }> {
    const agentIds = [...new Set(this.performanceRecords.map((r) => r.agentId))];
    
    return agentIds
      .map((agentId) => {
        const typePerf = this.performanceRecords.find(
          (r) => r.agentId === agentId && r.taskType === taskType
        );
        
        if (!typePerf) {
          return { agentId, score: 0.5, reason: "No history for this task type" };
        }
        
        const total = typePerf.successCount + typePerf.failureCount;
        const successRate = total > 0 ? typePerf.successCount / total : 0.5;
        const costEfficiency = typePerf.avgCostUsd > 0 ? 1 / typePerf.avgCostUsd : 1;
        
        // Score: 70% success rate + 30% cost efficiency (capped at 1)
        const score = successRate * 0.7 + Math.min(costEfficiency, 1) * 0.3;
        
        return {
          agentId,
          score,
          reason: `${(successRate * 100).toFixed(0)}% success, $${typePerf.avgCostUsd.toFixed(2)} avg cost (${total} tasks)`,
        };
      })
      .sort((a, b) => b.score - a.score);
  }
  
  /**
   * Estimate the cost and time for a task type based on historical data.
   */
  estimateTask(taskType: string): {
    estimatedCostUsd: number;
    estimatedTimeMs: number;
    confidence: number;
    sampleSize: number;
  } {
    const records = this.performanceRecords.filter(
      (r) => r.taskType === taskType
    );
    
    if (records.length === 0) {
      return {
        estimatedCostUsd: 0.5, // Default estimate
        estimatedTimeMs: 30 * 60 * 1000, // 30 minutes
        confidence: 0,
        sampleSize: 0,
      };
    }
    
    const totalTasks = records.reduce((s, r) => s + r.totalTasksCompleted, 0);
    
    // Prevent division by zero
    const avgCost = totalTasks > 0
      ? records.reduce((s, r) => s + r.avgCostUsd * r.totalTasksCompleted, 0) / totalTasks
      : 0.5; // Default estimate
    const avgTime = totalTasks > 0
      ? records.reduce((s, r) => s + r.avgCompletionTimeMs * r.totalTasksCompleted, 0) / totalTasks
      : 30 * 60 * 1000; // 30 minutes default
    
    // Confidence increases with sample size (log curve)
    const confidence = Math.min(Math.log10(totalTasks + 1) / 2, 1);
    
    return {
      estimatedCostUsd: avgCost,
      estimatedTimeMs: avgTime,
      confidence,
      sampleSize: totalTasks,
    };
  }
}
