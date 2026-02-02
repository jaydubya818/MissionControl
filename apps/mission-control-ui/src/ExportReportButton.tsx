import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ExportReportButtonProps {
  taskId: Id<"tasks">;
}

export function ExportReportButton({ taskId }: ExportReportButtonProps) {
  const reportData = useQuery(api.reports.generateIncidentReport, { taskId });
  
  const handleExport = () => {
    if (!reportData) return;
    
    const blob = new Blob([reportData.report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-report-${taskId.slice(-6)}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <button
      onClick={handleExport}
      disabled={!reportData}
      style={{
        padding: "8px 16px",
        background: reportData ? "#3b82f6" : "#334155",
        border: "none",
        borderRadius: "6px",
        color: "white",
        fontSize: "14px",
        fontWeight: 500,
        cursor: reportData ? "pointer" : "not-allowed",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      📄 Export Report
    </button>
  );
}
