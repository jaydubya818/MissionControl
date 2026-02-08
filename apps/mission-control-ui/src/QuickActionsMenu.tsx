import { useState } from "react";

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
    <div style={{ position: "relative" }}>
      {/* Quick Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          border: "none",
          color: "white",
          fontSize: "24px",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
          zIndex: 999,
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(102, 126, 234, 0.6)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
        }}
      >
        {isOpen ? "×" : "+"}
      </button>

      {/* Actions Menu */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "92px",
            right: "24px",
            background: "#1e293b",
            borderRadius: "12px",
            padding: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            zIndex: 998,
            minWidth: "200px",
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => {
                action.action();
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                color: "#e2e8f0",
                fontSize: "14px",
                cursor: "pointer",
                borderRadius: "6px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#334155";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span>{action.label}</span>
              <span style={{ fontSize: "12px", color: "#64748b" }}>{action.shortcut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
