import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface QuickActionsMenuProps {
  onCreateTask: () => void;
  onOpenSearch: () => void;
  onOpenApprovals: () => void;
  onOpenAgents: () => void;
  onOpenControls?: () => void;
}

export function QuickActionsMenu({
  onCreateTask,
  onOpenSearch,
  onOpenApprovals,
  onOpenAgents,
  onOpenControls,
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { id: "new-task", label: "📝 New Task", action: onCreateTask, shortcut: "⌘N" },
    { id: "search", label: "🔍 Search", action: onOpenSearch, shortcut: "⌘K" },
    { id: "approvals", label: "✅ Approvals", action: onOpenApprovals, shortcut: "⇧⌘A" },
    { id: "agents", label: "🤖 Agents", action: onOpenAgents, shortcut: "⌘2" },
    ...(onOpenControls
      ? [{ id: "controls", label: "🚨 Controls", action: onOpenControls, shortcut: "⇧⌘C" }]
      : []),
  ];

  return (
    <div className="relative">
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-[999] h-14 w-14 rounded-full shadow-lg hover:shadow-xl"
        onClick={() => setIsOpen((value) => !value)}
        aria-label={isOpen ? "Close quick actions" : "Open quick actions"}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-[92px] right-6 z-[998] min-w-[220px] p-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              className="mb-1 h-10 w-full justify-between px-3 text-sm last:mb-0"
              onClick={() => {
                action.action();
                setIsOpen(false);
              }}
            >
              <span>{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.shortcut}</span>
            </Button>
          ))}
        </Card>
      )}
    </div>
  );
}
