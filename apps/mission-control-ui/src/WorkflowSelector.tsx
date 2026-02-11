/**
 * Workflow Selector
 * 
 * Modal for selecting and starting a workflow.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

interface WorkflowSelectorProps {
  projectId?: Id<"projects">;
  onClose: () => void;
  onStarted?: (runId: string) => void;
}

export function WorkflowSelector({ projectId, onClose, onStarted }: WorkflowSelectorProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  
  const workflows = useQuery(api.workflows.list, { activeOnly: true });
  const startRun = useMutation(api.workflowRuns.start);
  
  const selectedWorkflow = workflows?.find((w) => w.workflowId === selectedWorkflowId);
  
  const handleStart = async () => {
    if (!selectedWorkflowId || !input.trim()) return;
    
    setIsStarting(true);
    try {
      const result = await startRun({
        workflowId: selectedWorkflowId,
        projectId,
        initialInput: input.trim(),
      });
      
      if (onStarted) {
        onStarted(result.runId);
      }
      
      onClose();
    } catch (error) {
      console.error("Failed to start workflow:", error);
      alert("Failed to start workflow: " + (error as Error).message);
    } finally {
      setIsStarting(false);
    }
  };
  
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
    }}>
      <div style={{
        width: "600px",
        maxHeight: "80vh",
        backgroundColor: "#1a1a1a",
        borderRadius: "12px",
        border: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "24px",
          borderBottom: "1px solid #333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
            Start Workflow
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontSize: "24px",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
        }}>
          {/* Workflow selection */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#ccc",
            }}>
              Select Workflow
            </label>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {workflows?.map((workflow) => (
                <div
                  key={workflow._id}
                  onClick={() => setSelectedWorkflowId(workflow.workflowId)}
                  style={{
                    padding: "16px",
                    backgroundColor: selectedWorkflowId === workflow.workflowId ? "#3b82f620" : "#0a0a0a",
                    border: `1px solid ${selectedWorkflowId === workflow.workflowId ? "#3b82f6" : "#333"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    marginBottom: "4px",
                    color: selectedWorkflowId === workflow.workflowId ? "#3b82f6" : "#fff",
                  }}>
                    {workflow.name}
                  </div>
                  <div style={{
                    fontSize: "13px",
                    color: "#888",
                    marginBottom: "8px",
                  }}>
                    {workflow.description}
                  </div>
                  <div style={{
                    fontSize: "12px",
                    color: "#666",
                  }}>
                    {workflow.steps.length} steps • {workflow.agents.length} agents
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Input field */}
          {selectedWorkflow && (
            <div>
              <label style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                marginBottom: "12px",
                color: "#ccc",
              }}>
                Task Description
              </label>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  selectedWorkflow.workflowId === "feature-dev"
                    ? "Add user authentication with OAuth"
                    : selectedWorkflow.workflowId === "bug-fix"
                    ? "Users can't log in after password reset"
                    : "Scan the codebase for security vulnerabilities"
                }
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "12px",
                  backgroundColor: "#0a0a0a",
                  border: "1px solid #333",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
              
              <div style={{
                fontSize: "12px",
                color: "#666",
                marginTop: "8px",
              }}>
                Describe the {selectedWorkflow.workflowId === "feature-dev" ? "feature" : selectedWorkflow.workflowId === "bug-fix" ? "bug" : "security concern"} you want the workflow to handle.
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{
          padding: "24px",
          borderTop: "1px solid #333",
          display: "flex",
          justifyContent: "flex-end",
          gap: "12px",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "1px solid #333",
              backgroundColor: "transparent",
              color: "#888",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!selectedWorkflowId || !input.trim() || isStarting}
            style={{
              padding: "10px 20px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: selectedWorkflowId && input.trim() && !isStarting ? "#3b82f6" : "#333",
              color: selectedWorkflowId && input.trim() && !isStarting ? "#fff" : "#666",
              cursor: selectedWorkflowId && input.trim() && !isStarting ? "pointer" : "not-allowed",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {isStarting ? "Starting..." : "Start Workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
