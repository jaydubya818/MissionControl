import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useToast } from "./Toast";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  PAUSED: "#eab308",
  DRAINED: "#94a3b8",
  QUARANTINED: "#ef4444",
  OFFLINE: "#64748b",
};

export function AgentRegistryView({ projectId }: { projectId: Id<"projects"> | null }) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});

  const updateStatus = useMutation(api.agents.updateStatus);
  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const resetAll = useMutation(api.agents.resetAll);
  const { toast } = useToast();

  const taskCountByAgent = useMemo(() => {
    const map = new Map<Id<"agents">, number>();
    if (!tasks) return map;
    for (const task of tasks) {
      for (const assigneeId of task.assigneeIds) {
        map.set(assigneeId, (map.get(assigneeId) ?? 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  if (!agents || !tasks) {
    return (
      <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <h2 style={{ color: "#e2e8f0", marginTop: 0 }}>Agent Registry</h2>
        <p style={{ color: "#64748b" }}>Loading agents...</p>
      </main>
    );
  }

  const activeCount = agents.filter((agent) => agent.status === "ACTIVE").length;
  const quarantinedCount = agents.filter((agent) => agent.status === "QUARANTINED").length;

  async function setStatus(agent: Doc<"agents">, status: string, reason: string) {
    const isDangerous = status === "QUARANTINED" || status === "DRAINED";
    if (isDangerous) {
      const ok = window.confirm(`Set ${agent.name} to ${status}?`);
      if (!ok) return;
    }
    try {
      await updateStatus({ agentId: agent._id, status, reason });
      toast(`${agent.name} -> ${status}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Status update failed", true);
    }
  }

  return (
    <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
      <h2 style={{ color: "#e2e8f0", marginTop: 0, marginBottom: 10 }}>Agent Registry</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard label="Agents" value={String(agents.length)} />
        <StatCard label="Active" value={String(activeCount)} color="#22c55e" />
        <StatCard label="Quarantined" value={String(quarantinedCount)} color="#ef4444" />
        <StatCard label="Assigned tasks" value={String(tasks.filter((task) => task.assigneeIds.length > 0).length)} />
      </div>

      <section
        style={{
          padding: 14,
          borderRadius: 8,
          border: "1px solid #334155",
          background: "#0f172a",
          marginBottom: 16,
        }}
      >
        <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginBottom: 10 }}>
          Operator Controls
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Pause all active agents?")) return;
              try {
                const result = await pauseAll({
                  projectId: projectId ?? undefined,
                  reason: "Operator pause from registry",
                  userId: "operator",
                });
                toast(`Paused ${(result as { paused: number }).paused} agent(s)`);
              } catch (error) {
                toast(error instanceof Error ? error.message : "Pause failed", true);
              }
            }}
            style={dangerButton}
          >
            Pause Squad
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const result = await resumeAll({
                  projectId: projectId ?? undefined,
                  reason: "Operator resume from registry",
                  userId: "operator",
                });
                toast(`Resumed ${(result as { resumed: number }).resumed} agent(s)`);
              } catch (error) {
                toast(error instanceof Error ? error.message : "Resume failed", true);
              }
            }}
            style={successButton}
          >
            Resume Squad
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const result = await resetAll({ projectId: projectId ?? undefined });
                toast(`Reset ${(result as { resetCount: number }).resetCount} agent(s)`);
              } catch (error) {
                toast(error instanceof Error ? error.message : "Reset failed", true);
              }
            }}
            style={neutralButton}
          >
            Reset Quarantined/Offline
          </button>
        </div>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {agents.map((agent) => {
          const lastHeartbeat = agent.lastHeartbeatAt
            ? new Date(agent.lastHeartbeatAt).toLocaleString()
            : "Never";
          const assignedCount = taskCountByAgent.get(agent._id) ?? 0;
          const budgetRemaining = agent.budgetDaily - agent.spendToday;

          return (
            <article
              key={agent._id}
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "1.2rem" }}>{agent.emoji || "🤖"}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: "#e2e8f0" }}>{agent.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{agent.role}</div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#fff",
                    background: STATUS_COLORS[agent.status] ?? "#64748b",
                    borderRadius: 4,
                    padding: "2px 8px",
                  }}
                >
                  {agent.status}
                </span>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
                <Field label="Capabilities" value={agent.allowedTaskTypes.length ? agent.allowedTaskTypes.join(", ") : "All task types"} />
                <Field label="Tools" value={agent.allowedTools?.length ? agent.allowedTools.join(", ") : "Default toolset"} />
                <Field label="Last heartbeat" value={lastHeartbeat} />
                <Field label="Assigned tasks" value={String(assignedCount)} />
                <Field label="Budget (today)" value={`$${agent.spendToday.toFixed(2)} / $${agent.budgetDaily.toFixed(2)}`} />
                <Field label="Budget remaining" value={`$${budgetRemaining.toFixed(2)}`} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setStatus(agent, "ACTIVE", "Operator activated agent")}
                  disabled={agent.status === "ACTIVE"}
                  style={miniButton}
                >
                  Activate
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(agent, "PAUSED", "Operator paused agent")}
                  disabled={agent.status === "PAUSED"}
                  style={miniButton}
                >
                  Pause
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(agent, "DRAINED", "Operator drained agent")}
                  disabled={agent.status === "DRAINED"}
                  style={miniButton}
                >
                  Drain
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(agent, "QUARANTINED", "Operator quarantined agent")}
                  disabled={agent.status === "QUARANTINED"}
                  style={dangerMiniButton}
                >
                  Quarantine
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: color || "#e2e8f0", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: "0.82rem", color: "#cbd5e1", marginTop: 2 }}>{value}</div>
    </div>
  );
}

const miniButton: React.CSSProperties = {
  padding: "6px 10px",
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: "0.78rem",
  cursor: "pointer",
};

const dangerMiniButton: React.CSSProperties = {
  ...miniButton,
  border: "1px solid #dc2626",
  color: "#fecaca",
  background: "#7f1d1d",
};

const dangerButton: React.CSSProperties = {
  ...miniButton,
  background: "#7f1d1d",
  border: "1px solid #ef4444",
  color: "#fecaca",
};

const successButton: React.CSSProperties = {
  ...miniButton,
  background: "#14532d",
  border: "1px solid #22c55e",
  color: "#bbf7d0",
};

const neutralButton: React.CSSProperties = {
  ...miniButton,
  background: "#334155",
};

