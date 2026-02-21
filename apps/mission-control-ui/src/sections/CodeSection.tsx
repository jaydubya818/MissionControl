import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { CodePipelineView } from "../CodePipelineView";
import { RecorderView } from "../RecorderView";
import { TestGenerationView } from "../TestGenerationView";
import { ApiImportView } from "../ApiImportView";
import { ExecutionView } from "../ExecutionView";
import { FlakyStepsView } from "../FlakyStepsView";
import { HybridWorkflowView } from "../HybridWorkflowView";
import { ScheduleView } from "../ScheduleView";
import { CodeGenView } from "../CodeGenView";
import { GherkinStudioView } from "../GherkinStudioView";
import { MetricsView } from "../MetricsView";

interface CodeSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onTaskSelect: (taskId: Id<"tasks">) => void;
}

export function CodeSection({ currentView, projectId, onTaskSelect }: CodeSectionProps) {
  if (currentView === "code") {
    return (
      <CodePipelineView
        projectId={projectId}
        onTaskSelect={(taskId) => onTaskSelect(taskId as Id<"tasks">)}
      />
    );
  }
  if (currentView === "recorder") return <RecorderView projectId={projectId} />;
  if (currentView === "test-generation") return <TestGenerationView projectId={projectId} />;
  if (currentView === "api-import") return <ApiImportView projectId={projectId} />;
  if (currentView === "execution") return <ExecutionView projectId={projectId} />;
  if (currentView === "flaky-steps") return <FlakyStepsView projectId={projectId} />;
  if (currentView === "hybrid-workflows") return <HybridWorkflowView projectId={projectId} />;
  if (currentView === "schedule") return <ScheduleView projectId={projectId} />;
  if (currentView === "codegen") return <CodeGenView projectId={projectId} />;
  if (currentView === "gherkin") return <GherkinStudioView projectId={projectId} />;
  if (currentView === "metrics") return <MetricsView projectId={projectId} />;
  return null;
}
