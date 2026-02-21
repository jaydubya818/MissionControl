/**
 * Workflow Metrics Dashboard
 * 
 * Analytics and performance tracking for workflows.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

interface WorkflowMetricsProps {
  projectId?: Id<"projects">;
}

export function WorkflowMetrics({ projectId }: WorkflowMetricsProps) {
  const summary = useQuery(api.workflowMetrics.getSummary, { projectId });
  const allMetrics = useQuery(api.workflowMetrics.getAllMetrics, { projectId });
  const workflows = useQuery(api.workflows.list, {});
  const refreshMetrics = useMutation(api.workflowMetrics.refreshAll);
  
  const handleRefresh = async () => {
    try {
      await refreshMetrics();
    } catch (error) {
      console.error("Failed to refresh metrics:", error);
    }
  };
  
  if (!summary || !allMetrics || !workflows) {
    return (
      <div style={{ padding: "20px", color: "#888" }}>
        Loading metrics...
      </div>
    );
  }
  
  const workflowMap = new Map(workflows.map((w) => [w.workflowId, w]));
  
  return (
    <div style={{
      padding: "24px",
      backgroundColor: "#0a0a0a",
      color: "#fff",
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "32px",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600 }}>
            Workflow Metrics
          </h1>
          <p style={{ margin: "8px 0 0 0", fontSize: "14px", color: "#888" }}>
            Performance analytics for multi-agent workflows
          </p>
        </div>
        <button
          onClick={handleRefresh}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "1px solid #333",
            backgroundColor: "#1a1a1a",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Refresh Metrics
        </button>
      </div>
      
      {/* Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "32px",
      }}>
        <MetricCard
          label="Total Runs"
          value={summary.total}
          color="#3b82f6"
        />
        <MetricCard
          label="Success Rate"
          value={`${Math.round(summary.successRate * 100)}%`}
          color="#10b981"
        />
        <MetricCard
          label="Avg Duration"
          value={`${Math.round(summary.avgDurationMs / 1000)}s`}
          color="#2563eb"
        />
        <MetricCard
          label="Total Retries"
          value={summary.totalRetries}
          color="#f59e0b"
        />
        <MetricCard
          label="Escalations"
          value={summary.totalEscalations}
          color="#ef4444"
        />
      </div>
      
      {/* Per-Workflow Metrics */}
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{
          fontSize: "18px",
          fontWeight: 600,
          marginBottom: "16px",
        }}>
          Workflow Performance
        </h2>
        
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
          gap: "16px",
        }}>
          {allMetrics.map((metric) => {
            const workflow = workflowMap.get(metric.workflowId);
            
            return (
              <div
                key={metric._id}
                style={{
                  padding: "20px",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "8px",
                }}
              >
                <div style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}>
                  {workflow?.name ?? metric.workflowId}
                </div>
                
                <div style={{
                  fontSize: "12px",
                  color: "#666",
                  marginBottom: "16px",
                }}>
                  Last 30 days
                </div>
                
                {/* Stats grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "16px",
                }}>
                  <StatItem label="Runs" value={metric.totalRuns} />
                  <StatItem
                    label="Success"
                    value={`${Math.round(metric.successRate * 100)}%`}
                    color={metric.successRate > 0.8 ? "#10b981" : metric.successRate > 0.5 ? "#f59e0b" : "#ef4444"}
                  />
                  <StatItem
                    label="Avg Time"
                    value={`${Math.round(metric.avgDurationMs / 1000)}s`}
                  />
                  <StatItem label="Retries" value={metric.totalRetries} />
                </div>
                
                {/* Bottlenecks */}
                {metric.bottlenecks.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: "12px",
                      color: "#888",
                      marginBottom: "8px",
                      fontWeight: 600,
                    }}>
                      Bottlenecks
                    </div>
                    {metric.bottlenecks.map((bottleneck) => (
                      <div
                        key={bottleneck.stepId}
                        style={{
                          fontSize: "11px",
                          color: "#ef4444",
                          backgroundColor: "#ef444410",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          marginBottom: "4px",
                        }}
                      >
                        {bottleneck.stepId}: {Math.round(bottleneck.failureRate * 100)}% failure,{" "}
                        {bottleneck.avgRetries.toFixed(1)} avg retries
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Recent Activity */}
      <div>
        <h2 style={{
          fontSize: "18px",
          fontWeight: 600,
          marginBottom: "16px",
        }}>
          Status Breakdown
        </h2>
        
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "16px",
        }}>
          <StatusCard label="Running" value={summary.running} color="#3b82f6" />
          <StatusCard label="Completed" value={summary.completed} color="#10b981" />
          <StatusCard label="Failed" value={summary.failed} color="#ef4444" />
          <StatusCard label="Paused" value={summary.paused} color="#f59e0b" />
        </div>
      </div>
    </div>
  );
}

// Helper Components

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding: "20px",
      backgroundColor: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: "8px",
    }}>
      <div style={{
        fontSize: "12px",
        color: "#888",
        marginBottom: "8px",
        textTransform: "uppercase",
        fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "32px",
        fontWeight: 700,
        color,
      }}>
        {value}
      </div>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div style={{
        fontSize: "11px",
        color: "#666",
        marginBottom: "4px",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "16px",
        fontWeight: 600,
        color: color || "#fff",
      }}>
        {value}
      </div>
    </div>
  );
}

function StatusCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: "16px",
      backgroundColor: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: "8px",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: "28px",
        fontWeight: 700,
        color,
        marginBottom: "4px",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: "12px",
        color: "#888",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  );
}
