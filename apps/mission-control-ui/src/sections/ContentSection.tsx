import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { CapturesView } from "../CapturesView";
import { ProjectsView } from "../ProjectsView";
import { DocsView } from "../DocsView";
import { ContentPipelineView } from "../ContentPipelineView";

interface ContentSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
}

export function ContentSection({ currentView, projectId }: ContentSectionProps) {
  if (currentView === "content-pipeline") return <ContentPipelineView projectId={projectId} />;
  if (currentView === "captures") return <CapturesView projectId={projectId} />;
  if (currentView === "projects") return <ProjectsView projectId={projectId} />;
  if (currentView === "docs") return <DocsView />;
  return null;
}
