import { useEffect } from "react";

interface KeyboardShortcutsProps {
  onNewTask: () => void;
  onSearch: () => void;
  onApprovals: () => void;
  onAgents: () => void;
}

export function useKeyboardShortcuts({
  onNewTask,
  onSearch,
  onApprovals,
  onAgents,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl key
      const isMod = e.metaKey || e.ctrlKey;
      
      if (!isMod) return;
      
      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          onNewTask();
          break;
        case "k":
          e.preventDefault();
          onSearch();
          break;
        case "a":
          e.preventDefault();
          onApprovals();
          break;
        case "e":
          e.preventDefault();
          onAgents();
          break;
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewTask, onSearch, onApprovals, onAgents]);
}

export function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ["⌘", "N"], description: "Create new task" },
    { keys: ["⌘", "K"], description: "Search" },
    { keys: ["⌘", "A"], description: "View approvals" },
    { keys: ["⌘", "E"], description: "View agents" },
    { keys: ["ESC"], description: "Close modal/drawer" },
    { keys: ["?"], description: "Show this help" },
  ];
  
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "500px",
          width: "100%",
          color: "#e2e8f0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 20px 0", fontSize: "20px" }}>
          ⌨️ Keyboard Shortcuts
        </h2>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {shortcuts.map((shortcut, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: idx < shortcuts.length - 1 ? "1px solid #334155" : "none",
              }}
            >
              <span style={{ fontSize: "14px" }}>{shortcut.description}</span>
              <div style={{ display: "flex", gap: "4px" }}>
                {shortcut.keys.map((key, keyIdx) => (
                  <kbd
                    key={keyIdx}
                    style={{
                      padding: "4px 8px",
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontFamily: "monospace",
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <button
          onClick={onClose}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "10px",
            background: "#3b82f6",
            border: "none",
            borderRadius: "6px",
            color: "white",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
