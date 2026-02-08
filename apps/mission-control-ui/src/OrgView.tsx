import { CSSProperties, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface OrgViewProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  borderLight: "#475569",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentPurple: "#8b5cf6",
  accentOrange: "#f59e0b",
  accentTeal: "#14b8a6",
  accentRed: "#ef4444",
};

type OrgNodeType = "human" | "agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNodeId(id: string): { type: OrgNodeType; entityId: string } | null {
  if (id.startsWith("agent-")) return { type: "agent", entityId: id.substring(6) };
  if (id.startsWith("human-")) return { type: "human", entityId: id.substring(6) };
  return null;
}

function timeAgo(timestamp: number | undefined): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function countNodesByType(nodes: any[], type: OrgNodeType): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === type) count++;
    if (node.children) {
      count += countNodesByType(node.children, type);
    }
  }
  return count;
}

const agentStatusColors: Record<string, string> = {
  ACTIVE: colors.accentGreen,
  PAUSED: colors.accentOrange,
  DRAINED: colors.textMuted,
  QUARANTINED: colors.accentRed,
  OFFLINE: colors.textMuted,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OrgView({ projectId }: OrgViewProps) {
  const hierarchy = useQuery(api.orgMembers.getUnifiedHierarchy, {
    projectId: projectId ?? undefined,
  });

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState<Id<"agents"> | undefined>(undefined);

  // Parse selection
  const parsedSelection = selectedNode ? parseNodeId(selectedNode) : null;

  // Detail queries — only fire when a node is selected
  const agentDetail = useQuery(
    api.agents.get,
    parsedSelection?.type === "agent"
      ? { agentId: parsedSelection.entityId as Id<"agents"> }
      : "skip"
  );
  const memberDetail = useQuery(
    api.orgMembers.get,
    parsedSelection?.type === "human"
      ? { id: parsedSelection.entityId as Id<"orgMembers"> }
      : "skip"
  );

  // Agent documents (WORKING.md, daily notes, session memory)
  const agentDocs = useQuery(
    api.agentDocuments.listByAgent,
    parsedSelection?.type === "agent"
      ? { agentId: parsedSelection.entityId as Id<"agents"> }
      : "skip"
  );

  // Mutations
  const updateAgent = useMutation(api.agents.update);
  const updateMember = useMutation(api.orgMembers.update);
  const registerAgent = useMutation(api.agents.register);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      if (selectedNode === nodeId) {
        setSelectedNode(null);
        setIsEditing(false);
      } else {
        setSelectedNode(nodeId);
        setIsEditing(false);
      }
    },
    [selectedNode]
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedNode(null);
    setIsEditing(false);
  }, []);

  const handleStartEditing = useCallback(() => {
    if (parsedSelection?.type === "agent" && agentDetail) {
      const meta = (agentDetail.metadata as any) || {};
      setEditForm({
        name: agentDetail.name,
        emoji: agentDetail.emoji || "",
        budgetDaily: agentDetail.budgetDaily,
        budgetPerRun: agentDetail.budgetPerRun,
        email: meta.email || "",
        telegram: meta.telegram || "",
        whatsapp: meta.whatsapp || "",
        discord: meta.discord || "",
        notes: meta.notes || "",
      });
    } else if (parsedSelection?.type === "human" && memberDetail) {
      const meta = (memberDetail.metadata as any) || {};
      setEditForm({
        name: memberDetail.name,
        email: memberDetail.email || "",
        role: memberDetail.role,
        title: memberDetail.title || "",
        personalEmail: meta.email || "",
        telegram: meta.telegram || "",
        whatsapp: meta.whatsapp || "",
        discord: meta.discord || "",
        notes: meta.notes || "",
      });
    }
    setIsEditing(true);
  }, [parsedSelection, agentDetail, memberDetail]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditForm({});
  }, []);

  const handleSave = useCallback(async () => {
    if (!parsedSelection) return;

    try {
      if (parsedSelection.type === "agent" && agentDetail) {
        const currentMeta = (agentDetail.metadata as any) || {};
        const newMeta = {
          ...currentMeta,
          email: editForm.email || undefined,
          telegram: editForm.telegram || undefined,
          whatsapp: editForm.whatsapp || undefined,
          discord: editForm.discord || undefined,
          notes: editForm.notes || undefined,
        };

        await updateAgent({
          agentId: parsedSelection.entityId as Id<"agents">,
          name: editForm.name,
          emoji: editForm.emoji || undefined,
          budgetDaily: Number(editForm.budgetDaily),
          budgetPerRun: Number(editForm.budgetPerRun),
          metadata: newMeta,
        });
      } else if (parsedSelection.type === "human") {
        const currentMeta = (memberDetail?.metadata as any) || {};
        const newMeta = {
          ...currentMeta,
          email: editForm.personalEmail || undefined,
          telegram: editForm.telegram || undefined,
          whatsapp: editForm.whatsapp || undefined,
          discord: editForm.discord || undefined,
          notes: editForm.notes || undefined,
        };

        await updateMember({
          id: parsedSelection.entityId as Id<"orgMembers">,
          name: editForm.name,
          email: editForm.email || undefined,
          role: editForm.role,
          title: editForm.title || undefined,
          metadata: newMeta,
        });
      }

      setIsEditing(false);
      setEditForm({});
    } catch (err: any) {
      console.error("Save failed:", err);
      alert(err.message || "Failed to save changes. Please try again.");
    }
  }, [parsedSelection, editForm, agentDetail, memberDetail, updateAgent, updateMember]);

  const updateField = useCallback((field: string, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleOpenCreate = useCallback((parentId?: Id<"agents">) => {
    setCreateParentId(parentId);
    setShowCreateModal(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setShowCreateModal(false);
    setCreateParentId(undefined);
  }, []);

  const handleCreateAgent = useCallback(
    async (form: CreateAgentForm) => {
      try {
        const meta: Record<string, string> = {};
        if (form.email) meta.email = form.email;
        if (form.telegram) meta.telegram = form.telegram;
        if (form.whatsapp) meta.whatsapp = form.whatsapp;
        if (form.discord) meta.discord = form.discord;

        await registerAgent({
          projectId: projectId ?? undefined,
          name: form.name,
          emoji: form.emoji || undefined,
          role: form.role,
          workspacePath: form.workspacePath,
          allowedTaskTypes: form.allowedTaskTypes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          budgetDaily: form.budgetDaily ? Number(form.budgetDaily) : undefined,
          budgetPerRun: form.budgetPerRun ? Number(form.budgetPerRun) : undefined,
          canSpawn: form.canSpawn,
          maxSubAgents: form.canSpawn ? Number(form.maxSubAgents || 0) : 0,
          parentAgentId: createParentId,
          metadata: Object.keys(meta).length > 0 ? meta : undefined,
        });

        setShowCreateModal(false);
        setCreateParentId(undefined);
      } catch (err: any) {
        console.error("Failed to create agent:", err);
        alert(err.message || "Failed to create agent. Please try again.");
      }
    },
    [registerAgent, projectId, createParentId]
  );

  // Loading / empty states
  if (!hierarchy) {
    return (
      <main style={styles.container}>
        <div style={styles.loading}>Loading org chart...</div>
      </main>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <main style={styles.container}>
        <div style={styles.empty}>
          <h2 style={styles.emptyTitle}>No Org Chart Yet</h2>
          <p style={styles.emptyText}>
            Add team members and agents to build your organizational hierarchy.
          </p>
          <button
            onClick={() => handleOpenCreate()}
            style={{ ...styles.btnAddAgent, marginTop: 16, padding: "10px 24px", fontSize: "1rem" }}
            aria-label="Add first agent"
          >
            + Add Your First Agent
          </button>
        </div>
        {showCreateModal && (
          <CreateAgentModal
            parentAgentId={createParentId}
            onClose={handleCloseCreate}
            onCreate={handleCreateAgent}
          />
        )}
      </main>
    );
  }

  // Count metrics
  const totalHumans = countNodesByType(hierarchy, "human");

  let apiAgents = 0;
  let localModels = 0;
  let totalBudget = 0;

  const countAgentMetrics = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.type === "agent") {
        if (node.agentRole === "INTERN") {
          localModels++;
        } else {
          apiAgents++;
        }
        totalBudget += node.budgetDaily || 0;
      }
      if (node.children) {
        countAgentMetrics(node.children);
      }
    }
  };

  countAgentMetrics(hierarchy);

  const drawerOpen = selectedNode !== null;

  return (
    <main style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ ...styles.title, marginBottom: 0 }}>Organization</h1>
          <button
            onClick={() => handleOpenCreate()}
            style={styles.btnAddAgent}
            aria-label="Add new agent"
          >
            + Add Agent
          </button>
        </div>
        <div style={styles.metrics}>
          <div style={styles.metric}>
            <span style={styles.metricIcon}>👤</span>
            <span style={styles.metricValue}>{totalHumans}</span>
            <span style={styles.metricLabel}>Human</span>
          </div>
          <div style={styles.metric}>
            <span style={styles.metricIcon}>🤖</span>
            <span style={styles.metricValue}>{apiAgents}</span>
            <span style={styles.metricLabel}>API Agents</span>
          </div>
          <div style={styles.metric}>
            <span style={styles.metricIcon}>💻</span>
            <span style={styles.metricValue}>{localModels}</span>
            <span style={styles.metricLabel}>Local Models</span>
          </div>
          <div style={styles.metric}>
            <span style={styles.metricIcon}>💰</span>
            <span style={styles.metricValue}>
              ${totalBudget.toFixed(0)}/day
            </span>
            <span style={styles.metricLabel}>Daily Budget</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Chart area */}
        <div
          style={{
            ...styles.chartContainer,
            flex: 1,
            overflow: "auto",
            transition: "margin-right 0.25s ease",
            marginRight: drawerOpen ? 480 : 0,
          }}
        >
          {hierarchy.map((root: any) => (
            <UnifiedOrgNode
              key={root.id}
              node={root}
              selectedId={selectedNode}
              onSelect={handleNodeSelect}
            />
          ))}
        </div>

        {/* Detail Drawer */}
        {drawerOpen && (
          <OrgDetailDrawer
            parsedSelection={parsedSelection}
            agentDetail={agentDetail}
            memberDetail={memberDetail}
            agentDocs={agentDocs}
            isEditing={isEditing}
            editForm={editForm}
            onClose={handleCloseDrawer}
            onStartEditing={handleStartEditing}
            onCancelEdit={handleCancelEdit}
            onSave={handleSave}
            onUpdateField={updateField}
            onAddSubAgent={
              parsedSelection?.type === "agent"
                ? () => handleOpenCreate(parsedSelection.entityId as Id<"agents">)
                : undefined
            }
          />
        )}
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          parentAgentId={createParentId}
          onClose={handleCloseCreate}
          onCreate={handleCreateAgent}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Detail Drawer
// ---------------------------------------------------------------------------

interface OrgDetailDrawerProps {
  parsedSelection: { type: OrgNodeType; entityId: string } | null;
  agentDetail: any;
  memberDetail: any;
  agentDocs: any[] | undefined;
  isEditing: boolean;
  editForm: Record<string, any>;
  onClose: () => void;
  onStartEditing: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onUpdateField: (field: string, value: any) => void;
  onAddSubAgent?: () => void;
}

function OrgDetailDrawer({
  parsedSelection,
  agentDetail,
  memberDetail,
  agentDocs,
  isEditing,
  editForm,
  onClose,
  onStartEditing,
  onCancelEdit,
  onSave,
  onUpdateField,
  onAddSubAgent,
}: OrgDetailDrawerProps) {
  const isAgent = parsedSelection?.type === "agent";
  const detail = isAgent ? agentDetail : memberDetail;

  if (!detail) {
    return (
      <aside style={styles.drawer}>
        <div style={styles.drawerHeader}>
          <span style={{ color: colors.textSecondary }}>Loading...</span>
          <button onClick={onClose} style={styles.drawerClose} aria-label="Close detail drawer">
            ✕
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside style={styles.drawer} role="dialog" aria-label={`${detail.name} details`}>
      {/* Drawer Header */}
      <div style={styles.drawerHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...styles.drawerAvatar,
              background: isAgent
                ? detail.role === "LEAD"
                  ? colors.accentBlue
                  : detail.role === "SPECIALIST"
                  ? colors.accentGreen
                  : colors.accentTeal
                : colors.accentPurple,
            }}
          >
            {isAgent ? detail.emoji || "🤖" : detail.avatar || "👤"}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={styles.drawerTitle}>{detail.name}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              {isAgent ? (
                <>
                  <span style={{ ...styles.drawerBadge, background: "rgba(59, 130, 246, 0.15)", color: colors.accentBlue }}>
                    {detail.role}
                  </span>
                  <span
                    style={{
                      ...styles.drawerBadge,
                      background: `${agentStatusColors[detail.status] || colors.textMuted}20`,
                      color: agentStatusColors[detail.status] || colors.textMuted,
                    }}
                  >
                    {detail.status}
                  </span>
                </>
              ) : (
                <span style={{ ...styles.drawerBadge, background: "rgba(139, 92, 246, 0.15)", color: colors.accentPurple }}>
                  {detail.role}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={styles.drawerClose} aria-label="Close detail drawer">
          ✕
        </button>
      </div>

      {/* Drawer Content */}
      <div style={styles.drawerContent}>
        {isAgent ? (
          <AgentDetailContent
            agent={detail}
            agentDocs={agentDocs}
            isEditing={isEditing}
            editForm={editForm}
            onUpdateField={onUpdateField}
          />
        ) : (
          <HumanDetailContent
            member={detail}
            isEditing={isEditing}
            editForm={editForm}
            onUpdateField={onUpdateField}
          />
        )}
      </div>

      {/* Drawer Footer with Actions */}
      <div style={styles.drawerFooter}>
        {isEditing ? (
          <>
            <button onClick={onSave} style={styles.btnPrimary}>
              Save Changes
            </button>
            <button onClick={onCancelEdit} style={styles.btnGhost}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={onStartEditing} style={styles.btnPrimary}>
              Edit
            </button>
            {onAddSubAgent && (
              <button onClick={onAddSubAgent} style={styles.btnGhost}>
                + Sub-Agent
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Agent Detail Content
// ---------------------------------------------------------------------------

function AgentDetailContent({
  agent,
  agentDocs,
  isEditing,
  editForm,
  onUpdateField,
}: {
  agent: any;
  agentDocs: any[] | undefined;
  isEditing: boolean;
  editForm: Record<string, any>;
  onUpdateField: (field: string, value: any) => void;
}) {
  const meta = (agent.metadata as any) || {};
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});

  const toggleDoc = (docType: string) => {
    setExpandedDocs((prev) => ({ ...prev, [docType]: !prev[docType] }));
  };

  // Organize documents by type
  const workingMd = agentDocs?.find((d: any) => d.type === "WORKING_MD");
  const dailyNote = agentDocs?.find((d: any) => d.type === "DAILY_NOTE");
  const sessionMemory = agentDocs?.find((d: any) => d.type === "SESSION_MEMORY");

  return (
    <>
      {/* Identity */}
      <DetailSection title="Identity">
        {isEditing ? (
          <>
            <EditField label="Name" value={editForm.name} onChange={(v) => onUpdateField("name", v)} />
            <EditField label="Emoji" value={editForm.emoji} onChange={(v) => onUpdateField("emoji", v)} placeholder="🤖" />
          </>
        ) : (
          <>
            <DetailRow label="Agent ID" value={agent._id} mono />
            <DetailRow label="Model" value={meta.model || "Claude Opus 4.5"} />
            <DetailRow label="Workspace" value={agent.workspacePath} mono />
            {agent.soulVersionHash && (
              <DetailRow label="Soul Version" value={agent.soulVersionHash} mono />
            )}
          </>
        )}
      </DetailSection>

      {/* Contact Channels */}
      <DetailSection title="Contact Channels">
        {isEditing ? (
          <>
            <EditField label="Email" value={editForm.email} onChange={(v) => onUpdateField("email", v)} placeholder="agent@example.com" />
            <EditField label="Telegram" value={editForm.telegram} onChange={(v) => onUpdateField("telegram", v)} placeholder="@username" />
            <EditField label="WhatsApp" value={editForm.whatsapp} onChange={(v) => onUpdateField("whatsapp", v)} placeholder="+1234567890" />
            <EditField label="Discord" value={editForm.discord} onChange={(v) => onUpdateField("discord", v)} placeholder="username" />
          </>
        ) : (
          <>
            {meta.email && (
              <DetailRow label="Email" value={meta.email} mono />
            )}
            <DetailRow label="Telegram" value={meta.telegram || "—"} />
            <DetailRow label="WhatsApp" value={meta.whatsapp || "—"} />
            <DetailRow label="Discord" value={meta.discord || "—"} />
          </>
        )}
      </DetailSection>

      {/* Configuration */}
      <DetailSection title="Configuration">
        {agent.allowedTaskTypes && agent.allowedTaskTypes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={styles.detailLabel}>Allowed Task Types</div>
            <div style={styles.tagWrap}>
              {agent.allowedTaskTypes.map((t: string) => (
                <span key={t} style={styles.tagBlue}>{t}</span>
              ))}
            </div>
          </div>
        )}
        {agent.allowedTools && agent.allowedTools.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={styles.detailLabel}>Allowed Tools</div>
            <div style={styles.tagWrap}>
              {agent.allowedTools.map((t: string) => (
                <span key={t} style={styles.tagGreen}>{t}</span>
              ))}
            </div>
          </div>
        )}
        <DetailRow label="Can Spawn Sub-Agents" value={agent.canSpawn ? "Yes" : "No"} />
        {agent.canSpawn && (
          <DetailRow label="Max Sub-Agents" value={String(agent.maxSubAgents)} />
        )}
      </DetailSection>

      {/* Budget */}
      <DetailSection title="Budget">
        {isEditing ? (
          <>
            <EditField label="Daily Budget ($)" value={editForm.budgetDaily} onChange={(v) => onUpdateField("budgetDaily", v)} type="number" />
            <EditField label="Per-Run Budget ($)" value={editForm.budgetPerRun} onChange={(v) => onUpdateField("budgetPerRun", v)} type="number" />
          </>
        ) : (
          <>
            {(() => {
              const daily = agent.budgetDaily ?? 0;
              const perRun = agent.budgetPerRun ?? 0;
              const spent = agent.spendToday ?? 0;
              const remaining = daily - spent;
              const ratio = daily > 0 ? spent / daily : 0;
              const ratioColor = ratio > 0.9 ? colors.accentRed : ratio > 0.7 ? colors.accentOrange : colors.accentGreen;
              return (
                <>
                  <DetailRow label="Daily Budget" value={`$${daily.toFixed(2)}`} />
                  <DetailRow label="Per-Run Budget" value={`$${perRun.toFixed(2)}`} />
                  <DetailRow label="Spent Today" value={`$${spent.toFixed(2)}`} />
                  <DetailRow
                    label="Remaining"
                    value={`$${remaining.toFixed(2)}`}
                    valueColor={ratioColor}
                  />
                  <div style={{ marginTop: 8 }}>
                    <div style={styles.budgetTrack}>
                      <div
                        style={{
                          ...styles.budgetFill,
                          width: `${Math.min(100, ratio * 100)}%`,
                          background: ratioColor,
                        }}
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </DetailSection>

      {/* Health */}
      <DetailSection title="Health">
        <DetailRow
          label="Status"
          value={agent.status}
          valueColor={agentStatusColors[agent.status]}
        />
        <DetailRow label="Last Heartbeat" value={timeAgo(agent.lastHeartbeatAt)} />
        <DetailRow
          label="Error Streak"
          value={String(agent.errorStreak)}
          valueColor={agent.errorStreak > 0 ? colors.accentRed : colors.textPrimary}
        />
        {agent.lastError && (
          <div style={{ marginTop: 8 }}>
            <div style={styles.detailLabel}>Last Error</div>
            <div style={styles.errorBox}>{agent.lastError}</div>
          </div>
        )}
      </DetailSection>

      {/* Notes */}
      <DetailSection title="Notes">
        {isEditing ? (
          <EditField
            label=""
            value={editForm.notes}
            onChange={(v) => onUpdateField("notes", v)}
            multiline
            placeholder="Add notes about this agent..."
          />
        ) : (
          <div style={{ color: meta.notes ? colors.textPrimary : colors.textMuted, fontSize: "0.875rem" }}>
            {meta.notes || "No notes yet."}
          </div>
        )}
      </DetailSection>

      {/* Documents & Memory */}
      <DetailSection title="Documents & Memory">
        {/* Soul File Reference */}
        <AgentDocumentCard
          title="SOUL.md"
          icon="🧠"
          description={agent.soulVersionHash
            ? `Version: ${agent.soulVersionHash.slice(0, 12)}...`
            : "No soul file linked yet"}
          location={agent.workspacePath ? `${agent.workspacePath}/SOUL.md` : undefined}
          content={null}
          expanded={expandedDocs["soul"] || false}
          onToggle={() => toggleDoc("soul")}
          empty={!agent.soulVersionHash}
        />

        {/* WORKING.md */}
        <AgentDocumentCard
          title="WORKING.md"
          icon="📝"
          description={workingMd
            ? `Updated ${timeAgo(workingMd.updatedAt)}`
            : "No working document yet"}
          content={workingMd?.content || null}
          expanded={expandedDocs["working"] || false}
          onToggle={() => toggleDoc("working")}
          empty={!workingMd}
        />

        {/* Daily Note */}
        <AgentDocumentCard
          title="Daily Note"
          icon="📅"
          description={dailyNote
            ? `Updated ${timeAgo(dailyNote.updatedAt)}`
            : "No daily note yet"}
          content={dailyNote?.content || null}
          expanded={expandedDocs["daily"] || false}
          onToggle={() => toggleDoc("daily")}
          empty={!dailyNote}
        />

        {/* Session Memory */}
        <AgentDocumentCard
          title="Session Memory"
          icon="💭"
          description={sessionMemory
            ? `Updated ${timeAgo(sessionMemory.updatedAt)}`
            : "No session memory yet"}
          content={sessionMemory?.content || null}
          expanded={expandedDocs["session"] || false}
          onToggle={() => toggleDoc("session")}
          empty={!sessionMemory}
        />

        {/* Persona Config Reference */}
        <AgentDocumentCard
          title="Persona Config"
          icon="🎭"
          description={`agents/${agent.name?.toLowerCase()}.yaml`}
          location={`agents/${agent.name?.toLowerCase()}.yaml`}
          content={null}
          expanded={expandedDocs["persona"] || false}
          onToggle={() => toggleDoc("persona")}
          empty={false}
        />
      </DetailSection>

      {/* System Prompt Preview */}
      {meta.systemPrompt && (
        <DetailSection title="System Prompt">
          <div style={{
            fontSize: "0.8rem",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            color: colors.textSecondary,
            background: "rgba(0,0,0,0.3)",
            padding: "12px",
            borderRadius: "6px",
            maxHeight: "200px",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}>
            {meta.systemPrompt}
          </div>
        </DetailSection>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Agent Document Card (collapsible)
// ---------------------------------------------------------------------------

function AgentDocumentCard({
  title,
  icon,
  description,
  location,
  content,
  expanded,
  onToggle,
  empty,
}: {
  title: string;
  icon: string;
  description: string;
  location?: string;
  content: string | null;
  expanded: boolean;
  onToggle: () => void;
  empty: boolean;
}) {
  const hasContent = content && content.length > 0;

  return (
    <div style={{
      background: empty ? "rgba(0,0,0,0.15)" : "rgba(59,130,246,0.06)",
      border: `1px solid ${empty ? colors.border : "rgba(59,130,246,0.15)"}`,
      borderRadius: "8px",
      marginBottom: "8px",
      overflow: "hidden",
      transition: "all 0.2s ease",
    }}>
      {/* Header (always visible) */}
      <div
        onClick={hasContent ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 12px",
          cursor: hasContent ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              color: empty ? colors.textMuted : colors.textPrimary,
            }}>
              {title}
            </span>
            {!empty && (
              <span style={{
                fontSize: "0.65rem",
                padding: "1px 6px",
                borderRadius: "4px",
                background: "rgba(16,185,129,0.15)",
                color: colors.accentGreen,
                fontWeight: 500,
              }}>
                active
              </span>
            )}
          </div>
          <div style={{
            fontSize: "0.75rem",
            color: colors.textMuted,
            marginTop: "2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {description}
          </div>
        </div>
        {hasContent && (
          <span style={{
            fontSize: "0.75rem",
            color: colors.textMuted,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}>
            ▼
          </span>
        )}
      </div>

      {/* Location path (if provided) */}
      {location && (
        <div style={{
          padding: "0 12px 8px",
          fontSize: "0.7rem",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          color: colors.textMuted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          📂 {location}
        </div>
      )}

      {/* Expandable content */}
      {expanded && hasContent && (
        <div style={{
          borderTop: `1px solid ${colors.border}`,
          padding: "12px",
          maxHeight: "300px",
          overflow: "auto",
        }}>
          <pre style={{
            fontSize: "0.75rem",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            color: colors.textSecondary,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            lineHeight: 1.6,
          }}>
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Human Detail Content
// ---------------------------------------------------------------------------

function HumanDetailContent({
  member,
  isEditing,
  editForm,
  onUpdateField,
}: {
  member: any;
  isEditing: boolean;
  editForm: Record<string, any>;
  onUpdateField: (field: string, value: any) => void;
}) {
  const meta = (member.metadata as any) || {};

  return (
    <>
      {/* Identity */}
      <DetailSection title="Identity">
        {isEditing ? (
          <>
            <EditField label="Name" value={editForm.name} onChange={(v) => onUpdateField("name", v)} />
            <EditField label="Email" value={editForm.email} onChange={(v) => onUpdateField("email", v)} placeholder="email@example.com" />
            <EditField label="Role" value={editForm.role} onChange={(v) => onUpdateField("role", v)} />
            <EditField label="Title" value={editForm.title} onChange={(v) => onUpdateField("title", v)} placeholder="Job title" />
          </>
        ) : (
          <>
            <DetailRow label="Email" value={member.email || "—"} />
            {member.title && <DetailRow label="Title" value={member.title} />}
            <DetailRow label="Level" value={String(member.level)} />
          </>
        )}
      </DetailSection>

      {/* Contact Channels */}
      <DetailSection title="Contact Channels">
        {isEditing ? (
          <>
            <EditField label="Personal Email" value={editForm.personalEmail} onChange={(v) => onUpdateField("personalEmail", v)} placeholder="email@example.com" />
            <EditField label="Telegram" value={editForm.telegram} onChange={(v) => onUpdateField("telegram", v)} placeholder="@username" />
            <EditField label="WhatsApp" value={editForm.whatsapp} onChange={(v) => onUpdateField("whatsapp", v)} placeholder="+1234567890" />
            <EditField label="Discord" value={editForm.discord} onChange={(v) => onUpdateField("discord", v)} placeholder="username" />
          </>
        ) : (
          <>
            {meta.email && (
              <DetailRow label="Personal Email" value={meta.email} mono />
            )}
            <DetailRow label="Telegram" value={meta.telegram || "—"} />
            <DetailRow label="WhatsApp" value={meta.whatsapp || "—"} />
            <DetailRow label="Discord" value={meta.discord || "—"} />
          </>
        )}
      </DetailSection>

      {/* Organization */}
      <DetailSection title="Organization">
        {member.responsibilities && member.responsibilities.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={styles.detailLabel}>Responsibilities</div>
            <div style={styles.tagWrap}>
              {member.responsibilities.map((r: string, i: number) => (
                <span key={i} style={styles.tagPurple}>{r}</span>
              ))}
            </div>
          </div>
        )}
      </DetailSection>

      {/* Notes */}
      <DetailSection title="Notes">
        {isEditing ? (
          <EditField
            label=""
            value={editForm.notes}
            onChange={(v) => onUpdateField("notes", v)}
            multiline
            placeholder="Add notes about this team member..."
          />
        ) : (
          <div style={{ color: meta.notes ? colors.textPrimary : colors.textMuted, fontSize: "0.875rem" }}>
            {meta.notes || "No notes yet."}
          </div>
        )}
      </DetailSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared Detail Components
// ---------------------------------------------------------------------------

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.detailSection}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span
        style={{
          ...styles.detailValue,
          ...(mono && { fontFamily: "monospace", fontSize: "0.8rem" }),
          ...(valueColor && { color: valueColor }),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={styles.editLabel}>{label}</label>}
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={styles.editTextarea}
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={styles.editInput}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org Chart Node (updated from original)
// ---------------------------------------------------------------------------

interface UnifiedOrgNodeProps {
  node: any;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function UnifiedOrgNode({ node, selectedId, onSelect }: UnifiedOrgNodeProps) {
  const isSelected = node.id === selectedId;
  const hasChildren = node.children && node.children.length > 0;

  let cardColor = colors.accentBlue;

  if (node.type === "human") {
    cardColor = colors.accentPurple;
  } else if (node.type === "agent") {
    if (node.agentRole === "LEAD") {
      cardColor = colors.accentBlue;
    } else if (node.agentRole === "SPECIALIST") {
      cardColor = colors.accentGreen;
    } else {
      cardColor = colors.accentTeal;
    }
  }

  const formatPricing = (budgetPerRun: number) => {
    const perMTokens = (budgetPerRun / 1000000).toFixed(2);
    return `$${budgetPerRun.toFixed(0)} / $${perMTokens} per 1M tokens`;
  };

  return (
    <div style={styles.nodeContainer}>
      <button
        onClick={() => onSelect(node.id)}
        style={{
          ...styles.nodeCard,
          borderColor: isSelected ? cardColor : colors.border,
          ...(isSelected && { boxShadow: `0 0 0 2px ${cardColor}40` }),
        }}
        aria-label={`${node.name}, ${node.role}`}
      >
        <div style={styles.nodeHeader}>
          <div
            style={{
              ...styles.avatar,
              background: cardColor,
            }}
          >
            {node.type === "human" ? node.avatar || "👤" : node.emoji || "🤖"}
          </div>
          <div style={styles.nodeInfo}>
            <div style={styles.nodeName}>{node.name}</div>
            <div style={styles.nodeRole}>
              {node.type === "human" ? node.role : `${node.agentRole} Agent`}
            </div>
          </div>
          {node.active && (
            <div
              style={{
                ...styles.statusDot,
                background: colors.accentGreen,
              }}
              aria-label="Active"
            />
          )}
        </div>

        {/* Human-specific: responsibilities */}
        {node.type === "human" && node.responsibilities && node.responsibilities.length > 0 && (
          <div style={styles.responsibilities}>
            {node.responsibilities.slice(0, 4).map((resp: string, i: number) => (
              <span key={i} style={styles.tag}>
                {resp}
              </span>
            ))}
          </div>
        )}

        {/* Agent-specific: model info and capabilities */}
        {node.type === "agent" && (
          <>
            {node.model && (
              <div style={styles.modelInfo}>
                <div style={styles.modelName}>{node.model}</div>
                {node.budgetPerRun !== undefined && (
                  <div style={styles.pricing}>
                    💸 {formatPricing(node.budgetPerRun)}
                  </div>
                )}
              </div>
            )}
            {node.allowedTaskTypes && node.allowedTaskTypes.length > 0 && (
              <div style={styles.capabilities}>
                {node.allowedTaskTypes.slice(0, 4).map((cap: string, i: number) => (
                  <span key={i} style={styles.capabilityTag}>
                    {cap}
                  </span>
                ))}
                {node.allowedTaskTypes.length > 4 && (
                  <span style={styles.capabilityTag}>
                    +{node.allowedTaskTypes.length - 4}
                  </span>
                )}
              </div>
            )}
            {node.budgetDaily !== undefined && (
              <div style={styles.budgetBar}>
                <div style={styles.budgetLabel}>
                  Budget: ${node.spendToday?.toFixed(2) || 0} / $
                  {node.budgetDaily.toFixed(0)}
                </div>
                <div style={styles.budgetTrack}>
                  <div
                    style={{
                      ...styles.budgetFill,
                      width: `${Math.min(100, ((node.spendToday || 0) / node.budgetDaily) * 100)}%`,
                      background:
                        (node.spendToday || 0) / node.budgetDaily > 0.9
                          ? colors.accentOrange
                          : colors.accentGreen,
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </button>

      {hasChildren && (
        <div style={styles.childrenContainer}>
          <div style={styles.connector} />
          <div style={styles.childrenGrid}>
            {node.children.map((child: any) => (
              <UnifiedOrgNode
                key={child.id}
                node={child}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Agent Modal
// ---------------------------------------------------------------------------

interface CreateAgentForm {
  name: string;
  emoji: string;
  role: string;
  workspacePath: string;
  allowedTaskTypes: string;
  budgetDaily: string;
  budgetPerRun: string;
  canSpawn: boolean;
  maxSubAgents: string;
  email: string;
  telegram: string;
  whatsapp: string;
  discord: string;
}

const defaultCreateForm: CreateAgentForm = {
  name: "",
  emoji: "",
  role: "SPECIALIST",
  workspacePath: "/workspace",
  allowedTaskTypes: "",
  budgetDaily: "",
  budgetPerRun: "",
  canSpawn: false,
  maxSubAgents: "0",
  email: "",
  telegram: "",
  whatsapp: "",
  discord: "",
};

const roleOptions = [
  { value: "INTERN", label: "Intern", desc: "Limited access, lower budget ($2/day)" },
  { value: "SPECIALIST", label: "Specialist", desc: "Standard agent, focused tasks ($5/day)" },
  { value: "LEAD", label: "Lead", desc: "Full access, coordination role ($12/day)" },
];

function CreateAgentModal({
  parentAgentId,
  onClose,
  onCreate,
}: {
  parentAgentId?: Id<"agents">;
  onClose: () => void;
  onCreate: (form: CreateAgentForm) => void;
}) {
  const [form, setForm] = useState<CreateAgentForm>(defaultCreateForm);

  const update = (field: keyof CreateAgentForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const canSubmit = form.name.trim().length > 0 && form.role && form.workspacePath.trim().length > 0;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={parentAgentId ? "Add Sub-Agent" : "Add Agent"}
      >
        {/* Modal Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {parentAgentId ? "Add Sub-Agent" : "Add New Agent"}
          </h2>
          <button onClick={onClose} style={styles.drawerClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div style={styles.modalContent}>
          {/* Identity Section */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Identity</h3>
            <div style={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.editLabel}>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Research Agent"
                  style={styles.editInput}
                  autoFocus
                />
              </div>
              <div style={{ width: 80 }}>
                <label style={styles.editLabel}>Emoji</label>
                <input
                  type="text"
                  value={form.emoji}
                  onChange={(e) => update("emoji", e.target.value)}
                  placeholder="🤖"
                  style={styles.editInput}
                />
              </div>
            </div>
          </div>

          {/* Role Section */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Role</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("role", opt.value)}
                  style={{
                    ...styles.roleOption,
                    borderColor: form.role === opt.value ? colors.accentBlue : colors.border,
                    background: form.role === opt.value ? "rgba(59, 130, 246, 0.1)" : colors.bgPage,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary, fontSize: "0.875rem" }}>
                      {opt.label}
                    </span>
                    {form.role === opt.value && (
                      <span style={{ color: colors.accentBlue, fontSize: "0.875rem" }}>✓</span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: colors.textSecondary, marginTop: 2 }}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration Section */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Configuration</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.editLabel}>Workspace Path *</label>
              <input
                type="text"
                value={form.workspacePath}
                onChange={(e) => update("workspacePath", e.target.value)}
                placeholder="/workspace"
                style={styles.editInput}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.editLabel}>Allowed Task Types</label>
              <input
                type="text"
                value={form.allowedTaskTypes}
                onChange={(e) => update("allowedTaskTypes", e.target.value)}
                placeholder="ENGINEERING, CONTENT, RESEARCH (comma-separated)"
                style={styles.editInput}
              />
              <div style={{ fontSize: "0.75rem", color: colors.textMuted, marginTop: 4 }}>
                Leave empty to allow all task types
              </div>
            </div>
          </div>

          {/* Budget Section */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Budget</h3>
            <div style={{ fontSize: "0.8rem", color: colors.textMuted, marginBottom: 12 }}>
              Leave empty to use role-based defaults
            </div>
            <div style={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.editLabel}>Daily Budget ($)</label>
                <input
                  type="number"
                  value={form.budgetDaily}
                  onChange={(e) => update("budgetDaily", e.target.value)}
                  placeholder={
                    form.role === "LEAD" ? "12.00" : form.role === "SPECIALIST" ? "5.00" : "2.00"
                  }
                  style={styles.editInput}
                  step="0.50"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.editLabel}>Per-Run Budget ($)</label>
                <input
                  type="number"
                  value={form.budgetPerRun}
                  onChange={(e) => update("budgetPerRun", e.target.value)}
                  placeholder={
                    form.role === "LEAD" ? "1.50" : form.role === "SPECIALIST" ? "0.75" : "0.25"
                  }
                  style={styles.editInput}
                  step="0.25"
                />
              </div>
            </div>
          </div>

          {/* Contact Channels */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Contact Channels</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={styles.editLabel}>Email (for monitoring inbox/outbox)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="agent@sellerfi.ai"
                style={styles.editInput}
              />
            </div>
            <div style={styles.formRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.editLabel}>Telegram</label>
                <input
                  type="text"
                  value={form.telegram}
                  onChange={(e) => update("telegram", e.target.value)}
                  placeholder="@username"
                  style={styles.editInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.editLabel}>WhatsApp</label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={(e) => update("whatsapp", e.target.value)}
                  placeholder="+1234567890"
                  style={styles.editInput}
                />
              </div>
            </div>
          </div>

          {/* Spawning */}
          <div style={styles.modalSection}>
            <h3 style={styles.sectionTitle}>Sub-Agent Spawning</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <button
                onClick={() => update("canSpawn", !form.canSpawn)}
                style={{
                  ...styles.toggleBtn,
                  background: form.canSpawn ? colors.accentBlue : colors.border,
                }}
                aria-label="Toggle sub-agent spawning"
              >
                <div
                  style={{
                    ...styles.toggleKnob,
                    transform: form.canSpawn ? "translateX(16px)" : "translateX(0)",
                  }}
                />
              </button>
              <span style={{ color: colors.textPrimary, fontSize: "0.875rem" }}>
                Can spawn sub-agents
              </span>
            </div>
            {form.canSpawn && (
              <div style={{ width: 120 }}>
                <label style={styles.editLabel}>Max Sub-Agents</label>
                <input
                  type="number"
                  value={form.maxSubAgents}
                  onChange={(e) => update("maxSubAgents", e.target.value)}
                  style={styles.editInput}
                  min="0"
                  max="10"
                />
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={styles.modalFooter}>
          <button
            onClick={() => onCreate(form)}
            style={{
              ...styles.btnPrimary,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            disabled={!canSubmit}
          >
            Create Agent
          </button>
          <button onClick={onClose} style={styles.btnGhost}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  // Layout
  container: {
    flex: 1,
    overflow: "hidden",
    background: colors.bgPage,
    padding: "24px",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    marginBottom: "32px",
    flexShrink: 0,
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "16px",
  },
  metrics: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
  },
  metric: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  metricIcon: {
    fontSize: "1.25rem",
  },
  metricValue: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
  },
  metricLabel: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
  },

  // Chart
  chartContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "32px",
    paddingBottom: "48px",
  },

  // Org Node
  nodeContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  nodeCard: {
    width: 320,
    padding: "16px",
    background: colors.bgCard,
    border: `2px solid ${colors.border}`,
    borderRadius: 12,
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left",
  },
  nodeHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "1.5rem",
    fontWeight: 600,
    flexShrink: 0,
  },
  nodeInfo: {
    flex: 1,
    minWidth: 0,
  },
  nodeName: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "2px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  nodeRole: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  responsibilities: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  },
  tag: {
    padding: "6px 10px",
    background: colors.bgHover,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  modelInfo: {
    marginTop: "8px",
    paddingTop: "12px",
    borderTop: `1px solid ${colors.border}`,
  },
  modelName: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.textPrimary,
    marginBottom: "4px",
  },
  pricing: {
    fontSize: "0.75rem",
    color: colors.textMuted,
    marginTop: "2px",
  },
  capabilities: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "12px",
  },
  capabilityTag: {
    padding: "4px 8px",
    background: "rgba(59, 130, 246, 0.15)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: 4,
    fontSize: "0.7rem",
    color: colors.accentBlue,
    fontWeight: 500,
  },
  budgetBar: {
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: `1px solid ${colors.border}`,
  },
  budgetLabel: {
    fontSize: "0.75rem",
    color: colors.textMuted,
    marginBottom: "6px",
  },
  budgetTrack: {
    width: "100%",
    height: 4,
    background: colors.bgHover,
    borderRadius: 2,
    overflow: "hidden",
  },
  budgetFill: {
    height: "100%",
    transition: "width 0.3s ease",
    borderRadius: 2,
  },
  childrenContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "24px",
  },
  connector: {
    width: 2,
    height: 40,
    background: colors.border,
  },
  childrenGrid: {
    display: "flex",
    gap: "40px",
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: "1200px",
  },

  // Detail Drawer
  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 480,
    background: colors.bgCard,
    borderLeft: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    zIndex: 100,
    boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.3)",
  },
  drawerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: `1px solid ${colors.border}`,
    gap: 12,
  },
  drawerAvatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "1.5rem",
    fontWeight: 600,
    flexShrink: 0,
  },
  drawerTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  drawerBadge: {
    fontSize: "0.7rem",
    padding: "2px 8px",
    borderRadius: 4,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  drawerClose: {
    background: "none",
    border: "none",
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: "1.25rem",
    padding: "4px 8px",
    borderRadius: 4,
    flexShrink: 0,
    lineHeight: 1,
  },
  drawerContent: {
    flex: 1,
    overflowY: "auto",
    padding: "0 24px 24px",
  },
  drawerFooter: {
    padding: "16px 24px",
    borderTop: `1px solid ${colors.border}`,
    display: "flex",
    gap: 12,
    flexShrink: 0,
  },

  // Detail sections
  detailSection: {
    paddingTop: 20,
    paddingBottom: 4,
    borderBottom: `1px solid ${colors.border}`,
  },
  sectionTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginTop: 0,
    marginBottom: 12,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 12,
  },
  detailLabel: {
    fontSize: "0.8rem",
    color: colors.textSecondary,
    flexShrink: 0,
  },
  detailValue: {
    fontSize: "0.875rem",
    color: colors.textPrimary,
    textAlign: "right" as const,
    wordBreak: "break-all" as const,
    maxWidth: "60%",
  },

  // Tags
  tagWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  tagBlue: {
    padding: "3px 8px",
    background: "rgba(59, 130, 246, 0.15)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: 4,
    fontSize: "0.7rem",
    color: colors.accentBlue,
    fontWeight: 500,
  },
  tagGreen: {
    padding: "3px 8px",
    background: "rgba(16, 185, 129, 0.15)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: 4,
    fontSize: "0.7rem",
    color: colors.accentGreen,
    fontWeight: 500,
  },
  tagPurple: {
    padding: "3px 8px",
    background: "rgba(139, 92, 246, 0.15)",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    borderRadius: 4,
    fontSize: "0.7rem",
    color: colors.accentPurple,
    fontWeight: 500,
  },

  // Error box
  errorBox: {
    marginTop: 4,
    padding: "8px 12px",
    background: "rgba(239, 68, 68, 0.1)",
    border: `1px solid rgba(239, 68, 68, 0.25)`,
    borderRadius: 6,
    fontSize: "0.8rem",
    color: colors.accentRed,
    fontFamily: "monospace",
    wordBreak: "break-all" as const,
  },

  // Edit form
  editLabel: {
    display: "block",
    fontSize: "0.8rem",
    color: colors.textSecondary,
    marginBottom: 4,
  },
  editInput: {
    width: "100%",
    padding: "8px 12px",
    background: colors.bgPage,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  editTextarea: {
    width: "100%",
    padding: "8px 12px",
    background: colors.bgPage,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    outline: "none",
    resize: "vertical" as const,
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },

  // Add Agent button
  btnAddAgent: {
    padding: "8px 20px",
    background: colors.accentGreen,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 600,
    flexShrink: 0,
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 24,
  },
  modal: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    width: "100%",
    maxWidth: 560,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: `1px solid ${colors.border}`,
  },
  modalTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
  },
  modalContent: {
    flex: 1,
    overflowY: "auto",
    padding: "0 24px",
  },
  modalSection: {
    paddingTop: 20,
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
  },
  modalFooter: {
    padding: "16px 24px",
    borderTop: `1px solid ${colors.border}`,
    display: "flex",
    gap: 12,
    flexShrink: 0,
  },
  formRow: {
    display: "flex",
    gap: 12,
    marginBottom: 12,
  },
  roleOption: {
    padding: "12px 16px",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s",
  },
  toggleBtn: {
    width: 40,
    height: 24,
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    position: "relative" as const,
    transition: "background 0.2s",
    flexShrink: 0,
    padding: 0,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#fff",
    position: "absolute" as const,
    top: 3,
    left: 3,
    transition: "transform 0.2s",
  },

  // Buttons
  btnPrimary: {
    padding: "8px 20px",
    background: colors.accentBlue,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 600,
  },
  btnGhost: {
    padding: "8px 20px",
    background: "transparent",
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
  },

  // Loading / empty
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: colors.textSecondary,
    fontSize: "1rem",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    padding: "48px",
  },
  emptyTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "8px",
  },
  emptyText: {
    fontSize: "1rem",
    color: colors.textSecondary,
    marginTop: 0,
  },
};
