import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { ChatView } from "../ChatView";
import { CouncilView } from "../CouncilView";
import { CommandPanel } from "../CommandPanel";

interface ChatSectionProps {
  currentView: MainView;
  projectId: Id<"projects"> | null;
  onOpenSuggestionsDrawer: () => void;
}

export function ChatSection({ currentView, projectId, onOpenSuggestionsDrawer }: ChatSectionProps) {
  if (currentView === "chat") return <ChatView projectId={projectId} />;
  if (currentView === "council") return <CouncilView projectId={projectId} />;
  if (currentView === "command") {
    return (
      <CommandPanel
        projectId={projectId}
        onOpenSuggestionsDrawer={onOpenSuggestionsDrawer}
      />
    );
  }
  return null;
}
