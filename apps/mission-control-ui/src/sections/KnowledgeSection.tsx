import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { DocsView } from "../DocsView";
import { MemoryView } from "../MemoryView";
import { SearchBar } from "../SearchBar";

interface KnowledgeSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onTaskSelect: (taskId: string) => void;
}

export function KnowledgeSection({ currentView, projectId, onTaskSelect }: KnowledgeSectionProps) {
  if (currentView === "docs") return <DocsView />;
  if (currentView === "memory") return <MemoryView projectId={projectId} />;
  if (currentView === "search") {
    return (
      <main className="flex-1 overflow-auto p-6">
        <h2 className="text-foreground mb-4 text-lg font-semibold">Search</h2>
        <SearchBar
          projectId={projectId ?? undefined}
          onResultClick={(taskId) => onTaskSelect(taskId as string)}
        />
      </main>
    );
  }
  return null;
}
