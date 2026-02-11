/**
 * Workflow Run Panel
 * 
 * Displays workflow execution progress with step-by-step status indicators.
 * Real-time updates via Convex subscriptions.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

interface WorkflowRunPanelProps {
  runId: string;
  onClose?: () => void;
}

export function WorkflowRunPanel({ runId, onClose }: WorkflowRunPanelProps) {
  const run = useQuery(api.workflowRuns.get, { runId });
  const workflow = run ? useQuery(api.workflows.get, { workflowId: run.workflowId }) : null;
  
  if (!run || !workflow) {
    return (
      <div style={{ padding: "20px", color: "#888" }}>
        Loading workflow run...
      </div>
    );
  }
  
  const statusColors = {
    PENDING: "#6b7280",
    RUNNING: "#3b82f6",
    COMPLETED: "#10b981",
    FAILED: "#ef4444",
    PAUSED: "#f59e0b",
  };
  
  const stepStatusColors = {
    PENDING: "#6b7280",
    RUNNING: "#3b82f6",
    DONE: "#10b981",
    FAILED: "#ef4444",
  };
  
  const statusEmoji = {
    PENDING: "⏳",
    RUNNING: "▶️",
    DONE: "✅",
    FAILED: "❌",
  };
  
  return (
    <div style={{
      position: "fixed",
      top: 0,
      right: 0,
      width: "500px",
      height: "100vh",
      backgroundColor: "#1a1a1a",
      borderLeft: "1px solid #333",
      display: "flex",
      flexDirection: "column",
      zIndex: 1000,
    }}>
      {/* Header */}
      <div style={{
        padding: "20px",
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            {workflow.name}
          </h2>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
            Run: {run.runId}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        )}
      </div>
      
      {/* Status Badge */}
      <div style={{ padding: "20px", borderBottom: "1px solid #333" }}>
        <div style={{
          display: "inline-block",
          padding: "6px 12px",
          borderRadius: "6px",
          backgroundColor: statusColors[run.status] + "20",
          color: statusColors[run.status],
          fontSize: "12px",
          fontWeight: 600,
          textTransform: "uppercase",
        }}>
          {run.status}
        </div>
        
        <div style={{ marginTop: "12px", fontSize: "14px", color: "#ccc" }}>
          Step {run.currentStepIndex + 1} of {run.totalSteps}
        </div>
        
        {/* Progress bar */}
        <div style={{
          marginTop: "8px",
          height: "4px",
          backgroundColor: "#333",
          borderRadius: "2px",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${((run.currentStepIndex + 1) / run.totalSteps) * 100}%`,
            height: "100%",
            backgroundColor: statusColors[run.status],
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>
      
      {/* Initial Input */}
      <div style={{ padding: "20px", borderBottom: "1px solid #333" }}>
        <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
          INITIAL INPUT
        </div>
        <div style={{
          fontSize: "14px",
          color: "#ccc",
          backgroundColor: "#0a0a0a",
          padding: "12px",
          borderRadius: "6px",
          maxHeight: "100px",
          overflow: "auto",
        }}>
          {run.initialInput}
        </div>
      </div>
      
      {/* Steps */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px",
      }}>
        <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px" }}>
          WORKFLOW STEPS
        </div>
        
        {run.steps.map((step, index) => {
          const stepDef = workflow.steps[index];
          const agentDef = workflow.agents.find((a) => a.id === stepDef.agent);
          
          return (
            <div
              key={step.stepId}
              style={{
                marginBottom: "12px",
                padding: "12px",
                backgroundColor: index === run.currentStepIndex ? "#0a0a0a" : "transparent",
                borderRadius: "6px",
                border: index === run.currentStepIndex ? "1px solid #333" : "1px solid transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>
                  {statusEmoji[step.status]}
                </span>
                <span style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: stepStatusColors[step.status],
                }}>
                  {step.stepId}
                </span>
                <span style={{ fontSize: "12px", color: "#666" }}>
                  ({agentDef?.persona})
                </span>
              </div>
              
              {step.retryCount > 0 && (
                <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "4px" }}>
                  Retry {step.retryCount}/{stepDef.retryLimit}
                </div>
              )}
              
              {step.error && (
                <div style={{
                  fontSize: "11px",
                  color: "#ef4444",
                  marginTop: "4px",
                  backgroundColor: "#ef444410",
                  padding: "6px",
                  borderRadius: "4px",
                }}>
                  {step.error}
                </div>
              )}
              
              {step.status === "DONE" && step.output && (
                <div style={{
                  fontSize: "11px",
                  color: "#888",
                  marginTop: "4px",
                  maxHeight: "60px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {step.output.substring(0, 150)}
                  {step.output.length > 150 && "..."}
                </div>
              )}
              
              {step.startedAt && (
                <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                  {step.completedAt ? (
                    `Completed in ${Math.round((step.completedAt - step.startedAt) / 1000)}s`
                  ) : (
                    `Running for ${Math.round((Date.now() - step.startedAt) / 1000)}s`
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Footer */}
      <div style={{
        padding: "20px",
        borderTop: "1px solid #333",
        fontSize: "12px",
        color: "#666",
      }}>
        {run.completedAt ? (
          <div>
            Completed in {Math.round((run.completedAt - run.startedAt) / 1000)}s
          </div>
        ) : (
          <div>
            Running for {Math.round((Date.now() - run.startedAt) / 1000)}s
          </div>
        )}
      </div>
    </div>
  );
}
