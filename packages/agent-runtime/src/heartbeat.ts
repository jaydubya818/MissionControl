/**
 * Heartbeat Monitor
 * 
 * Manages the periodic heartbeat loop for an agent:
 *   - Sends heartbeat to Convex at configurable intervals
 *   - Tracks error streaks
 *   - Auto-quarantines on repeated failures
 *   - Reports pending tasks, notifications, and approvals
 *   - Handles recovery from stale/dead agents
 */

import { ConvexHttpClient } from "convex/browser";

export interface HeartbeatConfig {
  agentId: string;
  client: ConvexHttpClient;
  api: any;
  intervalMs: number;
  quarantineThreshold: number;
  agentName: string;
}

export interface HeartbeatResult {
  success: boolean;
  budgetRemaining?: number;
  budgetExceeded?: boolean;
  pendingTaskCount: number;
  claimableTaskCount: number;
  notificationCount: number;
  approvalCount: number;
  errorQuarantineWarning: boolean;
}

export class HeartbeatMonitor {
  private config: HeartbeatConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private lastResult: HeartbeatResult | null = null;
  
  constructor(config: HeartbeatConfig) {
    this.config = config;
  }
  
  /**
   * Start the heartbeat loop.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    
    // Send initial heartbeat
    await this.tick();
    
    // Start periodic loop
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error(`[${this.config.agentName}] Heartbeat error:`, err);
        this.consecutiveFailures++;
        
        if (this.consecutiveFailures >= this.config.quarantineThreshold) {
          console.error(
            `[${this.config.agentName}] ${this.consecutiveFailures} consecutive heartbeat failures. ` +
            `Agent should be quarantined.`
          );
        }
      });
    }, this.config.intervalMs);
  }
  
  /**
   * Stop the heartbeat loop.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }
  
  /**
   * Get the last heartbeat result.
   */
  getLastResult(): HeartbeatResult | null {
    return this.lastResult;
  }
  
  /**
   * Check if the heartbeat loop is running.
   */
  isRunning(): boolean {
    return this.running;
  }
  
  /**
   * Send a single heartbeat.
   */
  private async tick(): Promise<void> {
    try {
      const result = await this.config.client.mutation(
        this.config.api.agents.heartbeat,
        {
          agentId: this.config.agentId,
          status: "ACTIVE",
        }
      );
      
      const typedResult = result as any;
      
      this.lastResult = {
        success: typedResult.success,
        budgetRemaining: typedResult.budgetRemaining,
        budgetExceeded: typedResult.budgetExceeded,
        pendingTaskCount: typedResult.pendingTasks?.length ?? 0,
        claimableTaskCount: typedResult.claimableTasks?.length ?? 0,
        notificationCount: typedResult.pendingNotifications?.length ?? 0,
        approvalCount: typedResult.pendingApprovals?.length ?? 0,
        errorQuarantineWarning: typedResult.errorQuarantineWarning ?? false,
      };
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      
      // Log status
      if (this.lastResult.pendingTaskCount > 0 || this.lastResult.claimableTaskCount > 0) {
        console.log(
          `[${this.config.agentName}] HEARTBEAT — ` +
          `${this.lastResult.pendingTaskCount} pending, ` +
          `${this.lastResult.claimableTaskCount} claimable, ` +
          `$${this.lastResult.budgetRemaining?.toFixed(2)} remaining`
        );
      }
      
      // Handle notifications
      if (this.lastResult.notificationCount > 0) {
        await this.config.client.mutation(
          this.config.api.notifications.markAllReadForAgent,
          { agentId: this.config.agentId }
        );
      }
      
      // Warn on budget exceeded
      if (this.lastResult.budgetExceeded) {
        console.warn(`[${this.config.agentName}] BUDGET EXCEEDED — Agent should pause.`);
      }
      
      // Warn on error quarantine
      if (this.lastResult.errorQuarantineWarning) {
        console.warn(`[${this.config.agentName}] ERROR STREAK WARNING — Quarantine imminent.`);
      }
    } catch (err) {
      this.consecutiveFailures++;
      throw err;
    }
  }
}

/**
 * Detect stale agents that haven't sent a heartbeat within the threshold.
 * This runs as a Convex cron job, not in the runtime itself.
 * 
 * Recovery flow:
 *   1. Detect: Check lastHeartbeatAt against staleThresholdMs
 *   2. Alert: Create an alert in the alerts table
 *   3. Quarantine: Set agent status to QUARANTINED
 *   4. Reassign: Move agent's in-progress tasks to BLOCKED
 */
export interface StaleAgentInfo {
  agentId: string;
  agentName: string;
  lastHeartbeat: number;
  staleDurationMs: number;
  currentTaskId?: string;
}

export function isAgentStale(
  lastHeartbeatAt: number | undefined,
  staleThresholdMs: number
): boolean {
  if (!lastHeartbeatAt) return true;
  return Date.now() - lastHeartbeatAt > staleThresholdMs;
}
