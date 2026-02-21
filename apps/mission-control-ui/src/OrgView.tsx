import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, X, ChevronDown, Plus } from "lucide-react";

interface OrgViewProps {
  projectId: Id<"projects"> | null;
}

type OrgNodeType = "human" | "agent";

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
    if (node.children) count += countNodesByType(node.children, type);
  }
  return count;
}

const AGENT_STATUS_CLASSES: Record<string, string> = {
  ACTIVE: "text-emerald-500",
  PAUSED: "text-amber-500",
  DRAINED: "text-muted-foreground",
  QUARANTINED: "text-red-500",
  OFFLINE: "text-muted-foreground",
};

const AGENT_STATUS_BG: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  PAUSED: "bg-amber-500/10 text-amber-500",
  DRAINED: "bg-muted text-muted-foreground",
  QUARANTINED: "bg-red-500/10 text-red-500",
  OFFLINE: "bg-muted text-muted-foreground",
};

const ROLE_COLORS: Record<string, string> = {
  LEAD: "bg-blue-500",
  SPECIALIST: "bg-emerald-500",
  INTERN: "bg-teal-500",
};

export function OrgView({ projectId }: OrgViewProps) {
  const hierarchy = useQuery(api.orgMembers.getUnifiedHierarchy, {
    projectId: projectId ?? undefined,
  });

  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState<Id<"agents"> | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hierarchy || hierarchy.length === 0) return;
    if (selectedNode) return;

    const pendingFocusAgentId = window.localStorage.getItem("mc.org.focusAgentId");
    if (!pendingFocusAgentId) return;

    setSelectedNode(`agent-${pendingFocusAgentId}`);
    window.localStorage.removeItem("mc.org.focusAgentId");
  }, [hierarchy, selectedNode]);

  const parsedSelection = selectedNode ? parseNodeId(selectedNode) : null;

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

  const agentDocs = useQuery(
    api.agentDocuments.listByAgent,
    parsedSelection?.type === "agent"
      ? { agentId: parsedSelection.entityId as Id<"agents"> }
      : "skip"
  );

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

  useEffect(() => {
    if (!selectedNode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedNode(null);
        setIsEditing(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode]);

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
      setActionError(null);
    } catch (err: any) {
      setActionError(err?.message || "Failed to save changes. Please try again.");
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
        setActionError(null);
      } catch (err: any) {
        setActionError(err?.message || "Failed to create agent. Please try again.");
      }
    },
    [registerAgent, projectId, createParentId]
  );

  if (!hierarchy) {
    return (
      <main className="flex-1 overflow-hidden bg-background p-6 flex flex-col">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Loading org chart...
        </div>
      </main>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <main className="flex-1 overflow-hidden bg-background p-6 flex flex-col">
        <EmptyState
          icon={Users}
          title="No Org Chart Yet"
          description="Add team members and agents to build your organizational hierarchy."
        >
          <Button onClick={() => handleOpenCreate()} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Agent
          </Button>
        </EmptyState>
        <CreateAgentModal
          open={showCreateModal}
          parentAgentId={createParentId}
          onClose={handleCloseCreate}
          onCreate={handleCreateAgent}
        />
      </main>
    );
  }

  const totalHumans = countNodesByType(hierarchy, "human");

  let apiAgents = 0;
  let localModels = 0;
  let totalBudget = 0;

  const countAgentMetrics = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.type === "agent") {
        if (node.agentRole === "INTERN") localModels++;
        else apiAgents++;
        totalBudget += node.budgetDaily || 0;
      }
      if (node.children) countAgentMetrics(node.children);
    }
  };

  countAgentMetrics(hierarchy);

  const drawerOpen = selectedNode !== null;

  return (
    <main className="flex-1 overflow-hidden bg-background p-6 flex flex-col">
      {/* Header */}
      <div className="mb-8 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Organization</h1>
            {missionData?.missionStatement && (
              <p className="text-sm italic text-muted-foreground mt-2 max-w-xl">
                &ldquo;{missionData.missionStatement}&rdquo;
              </p>
            )}
          </div>
          <Button onClick={() => handleOpenCreate()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        </div>

        {/* Metrics */}
        <div className="flex gap-4 flex-wrap">
          <MetricPill icon="👤" value={totalHumans} label="Human" />
          <MetricPill icon="🤖" value={apiAgents} label="API Agents" />
          <MetricPill icon="💻" value={localModels} label="Local Models" />
          <MetricPill icon="💰" value={`$${totalBudget.toFixed(0)}/day`} label="Daily Budget" />
        </div>

        {actionError && (
          <div className="mt-4 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm flex items-center justify-between gap-3" role="alert">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-300" aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Chart + Drawer */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-1 overflow-auto flex flex-col items-center gap-8 pb-12 transition-[margin-left] duration-200"
          style={{ marginLeft: drawerOpen ? 480 : 0 }}
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

      <CreateAgentModal
        open={showCreateModal}
        parentAgentId={createParentId}
        onClose={handleCloseCreate}
        onCreate={handleCreateAgent}
      />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Metric Pill                                                        */
/* ------------------------------------------------------------------ */

function MetricPill({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-card">
      <span className="text-xl">{icon}</span>
      <span className="text-xl font-semibold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail Drawer                                                      */
/* ------------------------------------------------------------------ */

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
  const panelRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isAgent = parsedSelection?.type === "agent";
  const detail = isAgent ? agentDetail : memberDetail;

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => returnFocusRef.current?.focus({ preventScroll: true });
  }, []);

  if (!detail) {
    return (
      <aside
        ref={panelRef}
        className="fixed top-0 left-0 bottom-0 w-[480px] bg-card border-r border-border flex flex-col z-[100] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Loading details"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <span className="text-muted-foreground">Loading...</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close detail drawer">
            <X className="h-5 w-5" />
          </button>
        </div>
      </aside>
    );
  }

  const avatarColor = isAgent
    ? detail.role === "LEAD" ? "bg-blue-500" : detail.role === "SPECIALIST" ? "bg-emerald-500" : "bg-teal-500"
    : "bg-blue-500";

  return (
    <aside
      ref={panelRef}
      className="fixed top-0 left-0 bottom-0 w-[480px] bg-card border-r border-border flex flex-col z-[100] shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`${detail.name} details`}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-border gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-semibold shrink-0", avatarColor)}>
            {isAgent ? detail.emoji || "🤖" : detail.avatar || "👤"}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{detail.name}</h2>
            <div className="flex gap-2 items-center mt-1">
              {isAgent ? (
                <>
                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                    {detail.role}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs", AGENT_STATUS_BG[detail.status] || "bg-muted text-muted-foreground")}>
                    {detail.status}
                  </Badge>
                </>
              ) : (
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {detail.role}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Close detail drawer">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="px-6 pb-6">
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
      </ScrollArea>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
        {isEditing ? (
          <>
            <Button onClick={onSave}>Save Changes</Button>
            <Button variant="outline" onClick={onCancelEdit}>Cancel</Button>
          </>
        ) : (
          <>
            <Button onClick={onStartEditing}>Edit</Button>
            {onAddSubAgent && (
              <Button variant="outline" onClick={onAddSubAgent}>
                <Plus className="h-4 w-4 mr-1" />
                Sub-Agent
              </Button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Agent Detail Content                                               */
/* ------------------------------------------------------------------ */

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

  const workingMd = agentDocs?.find((d: any) => d.type === "WORKING_MD");
  const dailyNote = agentDocs?.find((d: any) => d.type === "DAILY_NOTE");
  const sessionMemory = agentDocs?.find((d: any) => d.type === "SESSION_MEMORY");

  return (
    <>
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
            {meta.email && <DetailRow label="Email" value={meta.email} mono />}
            <DetailRow label="Telegram" value={meta.telegram || "—"} />
            <DetailRow label="WhatsApp" value={meta.whatsapp || "—"} />
            <DetailRow label="Discord" value={meta.discord || "—"} />
          </>
        )}
      </DetailSection>

      <DetailSection title="Configuration">
        {agent.allowedTaskTypes && agent.allowedTaskTypes.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1.5">Allowed Task Types</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.allowedTaskTypes.map((t: string) => (
                <Badge key={t} variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {agent.allowedTools && agent.allowedTools.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1.5">Allowed Tools</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.allowedTools.map((t: string) => (
                <Badge key={t} variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <DetailRow label="Can Spawn Sub-Agents" value={agent.canSpawn ? "Yes" : "No"} />
        {agent.canSpawn && (
          <DetailRow label="Max Sub-Agents" value={String(agent.maxSubAgents)} />
        )}
      </DetailSection>

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
              const ratioClass = ratio > 0.9 ? "text-red-500" : ratio > 0.7 ? "text-amber-500" : "text-emerald-500";
              const barColor = ratio > 0.9 ? "bg-red-500" : ratio > 0.7 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <>
                  <DetailRow label="Daily Budget" value={`$${daily.toFixed(2)}`} />
                  <DetailRow label="Per-Run Budget" value={`$${perRun.toFixed(2)}`} />
                  <DetailRow label="Spent Today" value={`$${spent.toFixed(2)}`} />
                  <DetailRow label="Remaining" value={`$${remaining.toFixed(2)}`} valueClassName={ratioClass} />
                  <div className="mt-2">
                    <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-[width] duration-300", barColor)}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </DetailSection>

      <DetailSection title="Health">
        <DetailRow label="Status" value={agent.status} valueClassName={AGENT_STATUS_CLASSES[agent.status]} />
        <DetailRow label="Last Heartbeat" value={timeAgo(agent.lastHeartbeatAt)} />
        <DetailRow
          label="Error Streak"
          value={String(agent.errorStreak)}
          valueClassName={agent.errorStreak > 0 ? "text-red-500" : undefined}
        />
        {agent.lastError && (
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">Last Error</div>
            <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-mono break-all">
              {agent.lastError}
            </div>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Notes">
        {isEditing ? (
          <EditField label="" value={editForm.notes} onChange={(v) => onUpdateField("notes", v)} multiline placeholder="Add notes about this agent..." />
        ) : (
          <p className={cn("text-sm", meta.notes ? "text-foreground" : "text-muted-foreground")}>
            {meta.notes || "No notes yet."}
          </p>
        )}
      </DetailSection>

      <DetailSection title="Documents & Memory">
        <AgentDocumentCard title="SOUL.md" icon="🧠" description={agent.soulVersionHash ? `Version: ${agent.soulVersionHash.slice(0, 12)}...` : "No soul file linked yet"} location={agent.workspacePath ? `${agent.workspacePath}/SOUL.md` : undefined} content={null} expanded={expandedDocs["soul"] || false} onToggle={() => toggleDoc("soul")} empty={!agent.soulVersionHash} />
        <AgentDocumentCard title="WORKING.md" icon="📝" description={workingMd ? `Updated ${timeAgo(workingMd.updatedAt)}` : "No working document yet"} content={workingMd?.content || null} expanded={expandedDocs["working"] || false} onToggle={() => toggleDoc("working")} empty={!workingMd} />
        <AgentDocumentCard title="Daily Note" icon="📅" description={dailyNote ? `Updated ${timeAgo(dailyNote.updatedAt)}` : "No daily note yet"} content={dailyNote?.content || null} expanded={expandedDocs["daily"] || false} onToggle={() => toggleDoc("daily")} empty={!dailyNote} />
        <AgentDocumentCard title="Session Memory" icon="💭" description={sessionMemory ? `Updated ${timeAgo(sessionMemory.updatedAt)}` : "No session memory yet"} content={sessionMemory?.content || null} expanded={expandedDocs["session"] || false} onToggle={() => toggleDoc("session")} empty={!sessionMemory} />
        <AgentDocumentCard title="Persona Config" icon="🎭" description={`agents/${agent.name?.toLowerCase()}.yaml`} location={`agents/${agent.name?.toLowerCase()}.yaml`} content={null} expanded={expandedDocs["persona"] || false} onToggle={() => toggleDoc("persona")} empty={false} />
      </DetailSection>

      {meta.systemPrompt && (
        <DetailSection title="System Prompt">
          <pre className="text-xs font-mono text-muted-foreground bg-muted/50 p-3 rounded-md max-h-[200px] overflow-auto whitespace-pre-wrap leading-relaxed">
            {meta.systemPrompt}
          </pre>
        </DetailSection>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Agent Document Card                                                */
/* ------------------------------------------------------------------ */

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
    <div className={cn("rounded-lg border mb-2 overflow-hidden transition-colors", empty ? "bg-muted/30 border-border" : "bg-blue-500/5 border-blue-500/10")}>
      <div
        onClick={hasContent ? onToggle : undefined}
        className={cn("flex items-center gap-2.5 px-3 py-2.5 select-none", hasContent && "cursor-pointer")}
      >
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm font-semibold", empty ? "text-muted-foreground" : "text-foreground")}>
              {title}
            </span>
            {!empty && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                active
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{description}</div>
        </div>
        {hasContent && (
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
        )}
      </div>

      {location && (
        <div className="px-3 pb-2 text-[11px] font-mono text-muted-foreground truncate">
          📂 {location}
        </div>
      )}

      {expanded && hasContent && (
        <div className="border-t border-border p-3 max-h-[300px] overflow-auto">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words m-0 leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Human Detail Content                                               */
/* ------------------------------------------------------------------ */

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
            {meta.email && <DetailRow label="Personal Email" value={meta.email} mono />}
            <DetailRow label="Telegram" value={meta.telegram || "—"} />
            <DetailRow label="WhatsApp" value={meta.whatsapp || "—"} />
            <DetailRow label="Discord" value={meta.discord || "—"} />
          </>
        )}
      </DetailSection>

      <DetailSection title="Organization">
        {member.responsibilities && member.responsibilities.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1.5">Responsibilities</div>
            <div className="flex flex-wrap gap-1.5">
              {member.responsibilities.map((r: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Notes">
        {isEditing ? (
          <EditField label="" value={editForm.notes} onChange={(v) => onUpdateField("notes", v)} multiline placeholder="Add notes about this team member..." />
        ) : (
          <p className={cn("text-sm", meta.notes ? "text-foreground" : "text-muted-foreground")}>
            {meta.notes || "No notes yet."}
          </p>
        )}
      </DetailSection>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared Detail Components                                           */
/* ------------------------------------------------------------------ */

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-5 pb-1 border-b border-border">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between items-start mb-2.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-sm text-foreground text-right break-all max-w-[60%]", mono && "font-mono text-xs", valueClassName)}>
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
    <div className="mb-3">
      {label && <label className="block text-xs text-muted-foreground mb-1">{label}</label>}
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground outline-none resize-y font-[inherit] focus:ring-1 focus:ring-ring"
          rows={3}
        />
      ) : (
        <Input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Org Chart Node                                                     */
/* ------------------------------------------------------------------ */

interface UnifiedOrgNodeProps {
  node: any;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function UnifiedOrgNode({ node, selectedId, onSelect }: UnifiedOrgNodeProps) {
  const isSelected = node.id === selectedId;
  const hasChildren = node.children && node.children.length > 0;

  let avatarColor = "bg-blue-500";
  let borderAccent = "border-blue-500";
  let ringAccent = "ring-blue-500/25";

  if (node.type === "human") {
    avatarColor = "bg-blue-500";
    borderAccent = "border-blue-500";
    ringAccent = "ring-blue-500/25";
  } else if (node.type === "agent") {
    if (node.agentRole === "LEAD") {
      avatarColor = "bg-blue-500";
      borderAccent = "border-blue-500";
      ringAccent = "ring-blue-500/25";
    } else if (node.agentRole === "SPECIALIST") {
      avatarColor = "bg-emerald-500";
      borderAccent = "border-emerald-500";
      ringAccent = "ring-emerald-500/25";
    } else {
      avatarColor = "bg-teal-500";
      borderAccent = "border-teal-500";
      ringAccent = "ring-teal-500/25";
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => onSelect(node.id)}
        className={cn(
          "w-80 p-4 bg-card border-2 rounded-lg cursor-pointer transition-all text-left hover:border-muted-foreground/50",
          isSelected ? cn(borderAccent, "ring-2", ringAccent) : "border-border"
        )}
        aria-label={`${node.name}, ${node.role}`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl font-semibold shrink-0", avatarColor)}>
            {node.type === "human" ? node.avatar || "👤" : node.emoji || "🤖"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-foreground truncate">{node.name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {node.type === "human" ? node.role : `${node.agentRole} Agent`}
            </div>
          </div>
          {node.active && (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" aria-label="Active" />
          )}
        </div>

        {node.type === "human" && node.responsibilities && node.responsibilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {node.responsibilities.slice(0, 4).map((resp: string, i: number) => (
              <span key={i} className="px-2.5 py-1.5 bg-muted border border-border rounded-md text-xs text-muted-foreground">
                {resp}
              </span>
            ))}
          </div>
        )}

        {node.type === "agent" && (
          <>
            {node.model && (
              <div className="mt-2 pt-3 border-t border-border">
                <div className="text-sm font-medium text-foreground mb-1">{node.model}</div>
                {node.budgetPerRun !== undefined && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    💸 ${node.budgetPerRun.toFixed(0)} / ${(node.budgetPerRun / 1000000).toFixed(2)} per 1M tokens
                  </div>
                )}
              </div>
            )}
            {node.allowedTaskTypes && node.allowedTaskTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {node.allowedTaskTypes.slice(0, 4).map((cap: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-[11px] bg-blue-500/10 text-blue-500 border-blue-500/20">
                    {cap}
                  </Badge>
                ))}
                {node.allowedTaskTypes.length > 4 && (
                  <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-500 border-blue-500/20">
                    +{node.allowedTaskTypes.length - 4}
                  </Badge>
                )}
              </div>
            )}
            {node.budgetDaily !== undefined && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground mb-1.5">
                  Budget: ${node.spendToday?.toFixed(2) || 0} / ${node.budgetDaily.toFixed(0)}
                </div>
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      (node.spendToday || 0) / node.budgetDaily > 0.9 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(100, ((node.spendToday || 0) / node.budgetDaily) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </button>

      {hasChildren && (
        <div className="flex flex-col items-center mt-6">
          <div className="w-0.5 h-10 bg-border" />
          <div className="flex gap-10 flex-wrap justify-center max-w-[1200px]">
            {node.children.map((child: any) => (
              <UnifiedOrgNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create Agent Modal                                                 */
/* ------------------------------------------------------------------ */

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
  open,
  parentAgentId,
  onClose,
  onCreate,
}: {
  open: boolean;
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[560px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-5 border-b border-border">
          <DialogTitle>{parentAgentId ? "Add Sub-Agent" : "Add New Agent"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          {/* Identity */}
          <ModalSection title="Identity">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Name *</label>
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Research Agent" autoFocus />
              </div>
              <div className="w-20">
                <label className="block text-xs text-muted-foreground mb-1">Emoji</label>
                <Input value={form.emoji} onChange={(e) => update("emoji", e.target.value)} placeholder="🤖" />
              </div>
            </div>
          </ModalSection>

          {/* Role */}
          <ModalSection title="Role">
            <div className="flex flex-col gap-2">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update("role", opt.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    form.role === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                    {form.role === opt.value && (
                      <span className="text-primary text-sm">✓</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </ModalSection>

          {/* Configuration */}
          <ModalSection title="Configuration">
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">Workspace Path *</label>
              <Input value={form.workspacePath} onChange={(e) => update("workspacePath", e.target.value)} placeholder="/workspace" />
            </div>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">Allowed Task Types</label>
              <Input value={form.allowedTaskTypes} onChange={(e) => update("allowedTaskTypes", e.target.value)} placeholder="ENGINEERING, CONTENT, RESEARCH (comma-separated)" />
              <p className="text-xs text-muted-foreground mt-1">Leave empty to allow all task types</p>
            </div>
          </ModalSection>

          {/* Budget */}
          <ModalSection title="Budget">
            <p className="text-xs text-muted-foreground mb-3">Leave empty to use role-based defaults</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Daily Budget ($)</label>
                <Input
                  type="number"
                  value={form.budgetDaily}
                  onChange={(e) => update("budgetDaily", e.target.value)}
                  placeholder={form.role === "LEAD" ? "12.00" : form.role === "SPECIALIST" ? "5.00" : "2.00"}
                  step="0.50"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Per-Run Budget ($)</label>
                <Input
                  type="number"
                  value={form.budgetPerRun}
                  onChange={(e) => update("budgetPerRun", e.target.value)}
                  placeholder={form.role === "LEAD" ? "1.50" : form.role === "SPECIALIST" ? "0.75" : "0.25"}
                  step="0.25"
                />
              </div>
            </div>
          </ModalSection>

          {/* Contact */}
          <ModalSection title="Contact Channels">
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">Email (for monitoring inbox/outbox)</label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="agent@sellerfi.ai" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Telegram</label>
                <Input value={form.telegram} onChange={(e) => update("telegram", e.target.value)} placeholder="@username" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">WhatsApp</label>
                <Input value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} placeholder="+1234567890" />
              </div>
            </div>
          </ModalSection>

          {/* Spawning */}
          <ModalSection title="Sub-Agent Spawning">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => update("canSpawn", !form.canSpawn)}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors shrink-0",
                  form.canSpawn ? "bg-primary" : "bg-border"
                )}
                aria-label="Toggle sub-agent spawning"
              >
                <div className={cn("absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white transition-transform", form.canSpawn && "translate-x-4")} />
              </button>
              <span className="text-sm text-foreground">Can spawn sub-agents</span>
            </div>
            {form.canSpawn && (
              <div className="w-[120px]">
                <label className="block text-xs text-muted-foreground mb-1">Max Sub-Agents</label>
                <Input type="number" value={form.maxSubAgents} onChange={(e) => update("maxSubAgents", e.target.value)} min="0" max="10" />
              </div>
            )}
          </ModalSection>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button onClick={() => onCreate(form)} disabled={!canSubmit}>
            Create Agent
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-5 pb-4 border-b border-border">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}
