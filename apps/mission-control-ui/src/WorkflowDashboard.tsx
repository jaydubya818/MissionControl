/**
 * Workflow Dashboard
 * 
 * Overview of all workflow runs with filtering and search.
 * Inspired by Antfarm's dashboard command.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { WorkflowRunPanel } from "./WorkflowRunPanel";

export function WorkflowDashboard() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  
  const runs = useQuery(api.workflowRuns.list, {
    status: statusFilter,
    limit: 50,
  });
  
  const workflows = useQuery(api.workflows.list, {});
  
  const statusColors = {
    PENDING: "#6b7280",
    RUNNING: "#3b82f6",
    COMPLETED: "#10b981",
    FAILED: "#ef4444",
    PAUSED: "#f59e0b",
  };
  
  const workflowMap = new Map(workflows?.map((w) => [w.workflowId, w]) ?? []);
  
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      backgroundColor: "#0a0a0a",
      color: "#fff",
    }}>
      {/* Main content */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "24px",
          borderBottom: "1px solid #333",
        }}>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600 }}>
            Workflow Runs
          </h1>
          <p style={{ margin: "8px 0 0 0", fontSize: "14px", color: "#888" }}>
            Multi-agent workflow execution dashboard
          </p>
        </div>
        
        {/* Filters */}
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid #333",
          display: "flex",
          gap: "12px",
        }}>
          <button
            onClick={() => setStatusFilter(undefined)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #333",
              backgroundColor: !statusFilter ? "#3b82f6" : "transparent",
              color: !statusFilter ? "#fff" : "#888",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            All
          </button>
          {["RUNNING", "COMPLETED", "FAILED", "PAUSED"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #333",
                backgroundColor: statusFilter === status ? statusColors[status as keyof typeof statusColors] : "transparent",
                color: statusFilter === status ? "#fff" : "#888",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {status}
            </button>
          ))}
        </div>
        
        {/* Runs list */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
        }}>
          {!runs || runs.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "#666",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🤖</div>
              <div style={{ fontSize: "16px", marginBottom: "8px" }}>
                No workflow runs yet
              </div>
              <div style={{ fontSize: "14px" }}>
                Start a workflow to see it here
              </div>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
              gap: "16px",
            }}>
              {runs.map((run) => {
                const workflow = workflowMap.get(run.workflowId);
                const completedSteps = run.steps.filter((s) => s.status === "DONE").length;
                
                return (
                  <div
                    key={run._id}
                    onClick={() => setSelectedRunId(run.runId)}
                    style={{
                      padding: "16px",
                      backgroundColor: "#1a1a1a",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#555";
                      e.currentTarget.style.backgroundColor = "#222";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#333";
                      e.currentTarget.style.backgroundColor = "#1a1a1a";
                    }}
                  >
                    {/* Status badge */}
                    <div style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: statusColors[run.status] + "20",
                      color: statusColors[run.status],
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      marginBottom: "12px",
                    }}>
                      {run.status}
                    </div>
                    
                    {/* Workflow name */}
                    <div style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}>
                      {workflow?.name ?? run.workflowId}
                    </div>
                    
                    {/* Run ID */}
                    <div style={{
                      fontSize: "12px",
                      color: "#666",
                      marginBottom: "12px",
                    }}>
                      {run.runId}
                    </div>
                    
                    {/* Initial input (truncated) */}
                    <div style={{
                      fontSize: "13px",
                      color: "#888",
                      marginBottom: "12px",
                      maxHeight: "40px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {run.initialInput}
                    </div>
                    
                    {/* Progress */}
                    <div style={{
                      fontSize: "12px",
                      color: "#666",
                      marginBottom: "8px",
                    }}>
                      {completedSteps} / {run.totalSteps} steps completed
                    </div>
                    
                    {/* Progress bar */}
                    <div style={{
                      height: "4px",
                      backgroundColor: "#333",
                      borderRadius: "2px",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${(completedSteps / run.totalSteps) * 100}%`,
                        height: "100%",
                        backgroundColor: statusColors[run.status],
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                    
                    {/* Timestamp */}
                    <div style={{
                      fontSize: "11px",
                      color: "#555",
                      marginTop: "12px",
                    }}>
                      {new Date(run.startedAt).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Side panel */}
      {selectedRunId && (
        <WorkflowRunPanel
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}
