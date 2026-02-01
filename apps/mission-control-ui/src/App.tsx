import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Kanban } from "./Kanban";
import { TaskDrawer } from "./TaskDrawer";

export default function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "12px 20px", borderBottom: "1px solid #334155", background: "#1e293b" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Mission Control</h1>
      </header>
      <main style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <Kanban onSelectTask={setSelectedTaskId} />
      </main>
      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
