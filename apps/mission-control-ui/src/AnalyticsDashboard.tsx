import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface AnalyticsDashboardProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function AnalyticsDashboard({ projectId, onClose }: AnalyticsDashboardProps) {
  const agents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : {}
  );
  
  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : {}
  );
  
  const runs = useQuery(
    api.runs.listRecent,
    { limit: 1000 }
  );

  if (!agents || !tasks || !runs) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}>
        <div style={{
          background: "#1e293b",
          borderRadius: "12px",
          padding: "24px",
        }}>
          <div style={{
            width: "32px",
            height: "32px",
            border: "3px solid #3b82f6",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
        </div>
      </div>
    );
  }

  // Calculate metrics
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Cost forecasting (7-day trend)
  const last7DaysRuns = runs.filter(r => r.startedAt >= sevenDaysAgo);
  const dailyCosts = new Array(7).fill(0);
  
  last7DaysRuns.forEach(run => {
    const daysAgo = Math.floor((now - run.startedAt) / (24 * 60 * 60 * 1000));
    if (daysAgo >= 0 && daysAgo < 7) {
      dailyCosts[6 - daysAgo] += run.costUsd;
    }
  });

  const avgDailyCost = dailyCosts.reduce((a, b) => a + b, 0) / 7;
  const forecast7Days = avgDailyCost * 7;

  // Agent efficiency scores
  const agentEfficiency = agents.map(agent => {
    const agentTasks = tasks.filter(t => t.assigneeIds.includes(agent._id));
    const agentRuns = runs.filter(r => r.agentId === agent._id);
    
    const completedTasks = agentTasks.filter(t => t.status === "DONE").length;
    const totalCost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const totalTime = agentRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0);
    
    const tasksPerHour = totalTime > 0 ? (completedTasks / (totalTime / (1000 * 60 * 60))) : 0;
    const costPerTask = completedTasks > 0 ? totalCost / completedTasks : 0;
    const efficiencyScore = completedTasks > 0 ? (completedTasks / (totalCost + 1)) * 100 : 0;
    
    return {
      agent,
      completedTasks,
      tasksPerHour,
      costPerTask,
      efficiencyScore,
      totalCost,
    };
  }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  // Task completion trends (7 days)
  const completionTrend = new Array(7).fill(0);
  tasks.filter(t => t.status === "DONE").forEach(task => {
    const daysAgo = Math.floor((now - task._creationTime) / (24 * 60 * 60 * 1000));
    if (daysAgo >= 0 && daysAgo < 7) {
      completionTrend[6 - daysAgo]++;
    }
  });

  // Bottleneck detection
  const bottlenecks = [];
  
  // Check for tasks stuck in REVIEW
  const reviewTasks = tasks.filter(t => t.status === "REVIEW");
  if (reviewTasks.length > 5) {
    bottlenecks.push({
      type: "Review Queue",
      count: reviewTasks.length,
      severity: "warning",
      message: `${reviewTasks.length} tasks waiting for review`,
    });
  }

  // Check for tasks needing approval
  const approvalTasks = tasks.filter(t => t.status === "NEEDS_APPROVAL");
  if (approvalTasks.length > 3) {
    bottlenecks.push({
      type: "Approval Queue",
      count: approvalTasks.length,
      severity: "critical",
      message: `${approvalTasks.length} tasks waiting for approval`,
    });
  }

  // Check for blocked tasks
  const blockedTasks = tasks.filter(t => t.status === "BLOCKED");
  if (blockedTasks.length > 0) {
    bottlenecks.push({
      type: "Blocked Tasks",
      count: blockedTasks.length,
      severity: "critical",
      message: `${blockedTasks.length} tasks are blocked`,
    });
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "20px",
      overflowY: "auto",
    }}>
      <div style={{
        background: "#1e293b",
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "1200px",
        width: "100%",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#e2e8f0", margin: 0 }}>
            📊 Advanced Analytics
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.5rem",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>

        {/* Cost Forecasting */}
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "12px" }}>
            💰 Cost Forecasting
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
            marginBottom: "16px",
          }}>
            <div style={{
              background: "#334155",
              padding: "16px",
              borderRadius: "8px",
            }}>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "4px" }}>Avg Daily Cost</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#3b82f6" }}>
                ${avgDailyCost.toFixed(2)}
              </div>
            </div>
            <div style={{
              background: "#334155",
              padding: "16px",
              borderRadius: "8px",
            }}>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "4px" }}>7-Day Forecast</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#8b5cf6" }}>
                ${forecast7Days.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Daily cost chart */}
          <div style={{
            background: "#334155",
            padding: "16px",
            borderRadius: "8px",
          }}>
            <div style={{ fontSize: "0.875rem", color: "#e2e8f0", marginBottom: "12px" }}>
              Daily Cost Trend (Last 7 Days)
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "100px" }}>
              {dailyCosts.map((cost, i) => {
                const maxCost = Math.max(...dailyCosts, 1);
                const height = (cost / maxCost) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div
                      style={{
                        width: "100%",
                        height: `${height}%`,
                        background: "#3b82f6",
                        borderRadius: "4px 4px 0 0",
                        minHeight: cost > 0 ? "4px" : "0",
                      }}
                      title={`$${cost.toFixed(2)}`}
                    />
                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "4px" }}>
                      {i === 6 ? "Today" : `${6 - i}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Agent Efficiency Leaderboard */}
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "12px" }}>
            🏆 Agent Efficiency Leaderboard
          </h3>
          <div style={{
            background: "#334155",
            borderRadius: "8px",
            overflow: "hidden",
          }}>
            {agentEfficiency.slice(0, 5).map((item, i) => (
              <div
                key={item.agent._id}
                style={{
                  padding: "12px 16px",
                  borderBottom: i < 4 ? "1px solid #1e293b" : "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : "#334155",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.875rem", color: "#e2e8f0" }}>
                      {item.agent.emoji} {item.agent.name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {item.completedTasks} tasks • ${item.totalCost.toFixed(2)} spent
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1rem", fontWeight: "bold", color: "#3b82f6" }}>
                    {item.efficiencyScore.toFixed(1)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    ${item.costPerTask.toFixed(2)}/task
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Completion Trend */}
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "12px" }}>
            📈 Task Completion Trend
          </h3>
          <div style={{
            background: "#334155",
            padding: "16px",
            borderRadius: "8px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "100px" }}>
              {completionTrend.map((count, i) => {
                const maxCount = Math.max(...completionTrend, 1);
                const height = (count / maxCount) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div
                      style={{
                        width: "100%",
                        height: `${height}%`,
                        background: "#10b981",
                        borderRadius: "4px 4px 0 0",
                        minHeight: count > 0 ? "4px" : "0",
                      }}
                      title={`${count} tasks`}
                    />
                    <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "4px" }}>
                      {i === 6 ? "Today" : `${6 - i}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottleneck Detection */}
        {bottlenecks.length > 0 && (
          <div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "12px" }}>
              ⚠️  Bottleneck Detection
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {bottlenecks.map((bottleneck, i) => (
                <div
                  key={i}
                  style={{
                    background: bottleneck.severity === "critical" ? "#7f1d1d" : "#78350f",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: `2px solid ${bottleneck.severity === "critical" ? "#ef4444" : "#f97316"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e2e8f0" }}>
                        {bottleneck.type}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
                        {bottleneck.message}
                      </div>
                    </div>
                    <div style={{
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      color: bottleneck.severity === "critical" ? "#ef4444" : "#f97316",
                    }}>
                      {bottleneck.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
