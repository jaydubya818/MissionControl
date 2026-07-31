import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

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
    <Button
      size="sm"
      onClick={handleExport}
      disabled={!reportData}
    >
      Export Report
    </Button>
  );
}
