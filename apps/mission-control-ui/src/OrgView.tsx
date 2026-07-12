import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { CreateAgentModal, type CreateAgentForm } from "@/CreateAgentModal";
import { PageHeader } from "./components/PageHeader";
import { Users, X, ChevronDown, Plus, FileText } from "lucide-react";

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
  ACTIVE: "text-ok",
  PAUSED: "text-warn",
  DRAINED: "text-ink-muted",
  QUARANTINED: "text-err",
  OFFLINE: "text-ink-muted",
};

const AGENT_STATUS_TONES: Record<string, StatusBadgeProps["tone"]> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DRAINED: "neutral",
  QUARANTINED: "error",
  OFFLINE: "neutral",
};

const ROLE_COLORS: Record<string, string> = {
  LEAD: "bg-info-soft",
  SPECIALIST: "bg-ok-soft",
  INTERN: "bg-surface-2",
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
          allowedTools: form.allowedTools
            ? form.allowedTools.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
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
        throw err;
      }
    },
    [registerAgent, projectId, createParentId]
  );

  if (!hierarchy) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto max-w-[1440px] px-6 py-6">
          <div className="h-[640px] animate-pulse rounded-xl border border-line bg-surface-2" />
        </div>
      </main>
    );
  }

  if (hierarchy.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Org Chart"
          description="Human and agent structure for the current project, including ownership, role posture, and organizational relationships."
          eyebrow="Comms"
          icon={<Users size={16} strokeWidth={1.7} />}
        />
        <div className="mx-auto max-w-[1440px] px-6 py-6">
          <EmptyState
            icon={Users}
            title="No org chart yet"
            description="Add team members and agents to build the reporting structure and ownership model for this project."
            action={
              <Button onClick={() => handleOpenCreate()} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add your first agent
              </Button>
            }
          />
        </div>
        <CreateAgentModal
          open={showCreateModal}
          projectId={projectId}
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
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Org Chart"
        description="Human and agent reporting structure for the operating system behind this project."
        eyebrow="Comms"
        icon={<Users size={16} strokeWidth={1.7} />}
        status={
          <StatusBadge tone="neutral">
            {totalHumans + apiAgents + localModels} nodes
          </StatusBadge>
        }
        actions={
          <Button onClick={() => handleOpenCreate()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add agent
          </Button>
        }
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        <div className="grid shrink-0 gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-[12.5px] font-medium text-ink-secondary">Humans</div>
            <div className="mt-1.5 text-[20px] font-semibold leading-none text-ink">{totalHumans}</div>
            <div className="mt-1.5 text-[12px] text-ink-muted">Human operators represented in the current hierarchy</div>
          </Card>
          <Card className="p-4">
            <div className="text-[12.5px] font-medium text-ink-secondary">API agents</div>
            <div className="mt-1.5 text-[20px] font-semibold leading-none text-ink">{apiAgents}</div>
            <div className="mt-1.5 text-[12px] text-ink-muted">Hosted or provider-backed agents in the current org structure</div>
          </Card>
          <Card className="p-4">
            <div className="text-[12.5px] font-medium text-ink-secondary">Local models</div>
            <div className="mt-1.5 text-[20px] font-semibold leading-none text-ink">{localModels}</div>
            <div className="mt-1.5 text-[12px] text-ink-muted">Intern-class or local runtime workers in the hierarchy</div>
          </Card>
          <Card className="p-4">
            <div className="text-[12.5px] font-medium text-ink-secondary">Daily budget</div>
            <div className="mt-1.5 font-mono text-[20px] font-semibold leading-none text-ink">${totalBudget.toFixed(0)}</div>
            <div className="mt-1.5 text-[12px] text-ink-muted">Combined budget exposure across agents in this view</div>
          </Card>
        </div>

        {missionData?.missionStatement ? (
          <Card className="p-5">
            <div className="text-[12.5px] font-medium text-ink-secondary">Operator brief</div>
            <p className="mt-2 max-w-4xl text-[13.5px] leading-relaxed text-ink-secondary">
              &ldquo;{missionData.missionStatement}&rdquo;
            </p>
          </Card>
        ) : null}

        {actionError ? (
          <div className="rounded-xl border border-transparent bg-err-soft px-4 py-3 text-[13px] text-err" role="alert">
            <div className="flex items-center justify-between gap-3">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-err transition-opacity duration-150 hover:opacity-80" aria-label="Dismiss error">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

      {/* Chart + Drawer */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
      </div>

      <CreateAgentModal
        open={showCreateModal}
        projectId={projectId}
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
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-line bg-surface-1">
      <span className="text-[15px]">{icon}</span>
      <span className="text-[15px] font-semibold text-ink">{value}</span>
      <span className="text-[12.5px] text-ink-muted">{label}</span>
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
        className="fixed top-0 left-0 bottom-0 w-[480px] bg-surface-3 border-r border-line flex flex-col z-[100] shadow-[var(--shadow-elevation-2)]"
        role="dialog"
        aria-modal="true"
        aria-label="Loading details"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-line">
          <span className="text-[13.5px] text-ink-muted">Loading...</span>
          <button onClick={onClose} className="text-ink-muted transition-colors duration-150 hover:text-ink" aria-label="Close detail drawer">
            <X className="h-5 w-5" />
          </button>
        </div>
      </aside>
    );
  }

  const avatarColor = "border border-line bg-surface-2";

  return (
    <aside
      ref={panelRef}
      className="fixed top-0 left-0 bottom-0 w-[480px] bg-surface-3 border-r border-line flex flex-col z-[100] shadow-[var(--shadow-elevation-2)]"
      role="dialog"
      aria-modal="true"
      aria-label={`${detail.name} details`}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-line gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-ink text-xl font-semibold shrink-0", avatarColor)}>
            {isAgent
              ? detail.emoji || detail.name?.charAt(0)?.toUpperCase()
              : detail.avatar || detail.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink truncate">{detail.name}</h2>
            <div className="flex gap-2 items-center mt-1">
              {isAgent ? (
                <>
                  <StatusBadge tone="neutral">{detail.role}</StatusBadge>
                  <StatusBadge tone={AGENT_STATUS_TONES[detail.status] ?? "neutral"}>
                    {detail.status}
                  </StatusBadge>
                </>
              ) : (
                <StatusBadge tone="neutral">{detail.role}</StatusBadge>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-muted transition-colors duration-150 hover:text-ink shrink-0" aria-label="Close detail drawer">
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
      <div className="px-6 py-4 border-t border-line flex gap-3 shrink-0">
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
            <div className="text-[12.5px] text-ink-muted mb-1.5">Allowed Task Types</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.allowedTaskTypes.map((t: string) => (
                <StatusBadge key={t} tone="neutral">
                  {t}
                </StatusBadge>
              ))}
            </div>
          </div>
        )}
        {agent.allowedTools && agent.allowedTools.length > 0 && (
          <div className="mb-3">
            <div className="text-[12.5px] text-ink-muted mb-1.5">Allowed Tools</div>
            <div className="flex flex-wrap gap-1.5">
              {agent.allowedTools.map((t: string) => (
                <StatusBadge key={t} tone="neutral">
                  {t}
                </StatusBadge>
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
              const ratioClass = ratio > 0.9 ? "text-err" : ratio > 0.7 ? "text-warn" : "text-ok";
              const barColor = ratio > 0.9 ? "bg-err" : ratio > 0.7 ? "bg-warn" : "bg-ok";
              return (
                <>
                  <DetailRow label="Daily Budget" value={`$${daily.toFixed(2)}`} />
                  <DetailRow label="Per-Run Budget" value={`$${perRun.toFixed(2)}`} />
                  <DetailRow label="Spent Today" value={`$${spent.toFixed(2)}`} />
                  <DetailRow label="Remaining" value={`$${remaining.toFixed(2)}`} valueClassName={ratioClass} />
                  <div className="mt-2">
                    <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
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
          valueClassName={agent.errorStreak > 0 ? "text-err" : undefined}
        />
        {agent.lastError && (
          <div className="mt-2">
            <div className="text-[12.5px] text-ink-muted mb-1">Last Error</div>
            <div className="px-3 py-2 rounded-lg bg-err-soft border border-transparent text-[12px] text-err font-mono break-all">
              {agent.lastError}
            </div>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Notes">
        {isEditing ? (
          <EditField label="" value={editForm.notes} onChange={(v) => onUpdateField("notes", v)} multiline placeholder="Add notes about this agent..." />
        ) : (
          <p className={cn("text-[13.5px]", meta.notes ? "text-ink" : "text-ink-muted")}>
            {meta.notes || "No notes yet."}
          </p>
        )}
      </DetailSection>

      <DetailSection title="Documents & Memory">
        <AgentDocumentCard title="SOUL.md" description={agent.soulVersionHash ? `Version: ${agent.soulVersionHash.slice(0, 12)}...` : "No soul file linked yet"} location={agent.workspacePath ? `${agent.workspacePath}/SOUL.md` : undefined} content={null} expanded={expandedDocs["soul"] || false} onToggle={() => toggleDoc("soul")} empty={!agent.soulVersionHash} />
        <AgentDocumentCard title="WORKING.md" description={workingMd ? `Updated ${timeAgo(workingMd.updatedAt)}` : "No working document yet"} content={workingMd?.content || null} expanded={expandedDocs["working"] || false} onToggle={() => toggleDoc("working")} empty={!workingMd} />
        <AgentDocumentCard title="Daily Note" description={dailyNote ? `Updated ${timeAgo(dailyNote.updatedAt)}` : "No daily note yet"} content={dailyNote?.content || null} expanded={expandedDocs["daily"] || false} onToggle={() => toggleDoc("daily")} empty={!dailyNote} />
        <AgentDocumentCard title="Session Memory" description={sessionMemory ? `Updated ${timeAgo(sessionMemory.updatedAt)}` : "No session memory yet"} content={sessionMemory?.content || null} expanded={expandedDocs["session"] || false} onToggle={() => toggleDoc("session")} empty={!sessionMemory} />
        <AgentDocumentCard title="Persona Config" description={`agents/${agent.name?.toLowerCase()}.yaml`} location={`agents/${agent.name?.toLowerCase()}.yaml`} content={null} expanded={expandedDocs["persona"] || false} onToggle={() => toggleDoc("persona")} empty={false} />
      </DetailSection>

      {meta.systemPrompt && (
        <DetailSection title="System Prompt">
          <pre className="text-[12px] font-mono text-ink-secondary bg-surface-2 p-3 rounded-lg max-h-[200px] overflow-auto whitespace-pre-wrap leading-relaxed">
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
  description,
  location,
  content,
  expanded,
  onToggle,
  empty,
}: {
  title: string;
  description: string;
  location?: string;
  content: string | null;
  expanded: boolean;
  onToggle: () => void;
  empty: boolean;
}) {
  const hasContent = content && content.length > 0;

  return (
    <div className="rounded-lg border border-line bg-surface-2 mb-2 overflow-hidden transition-colors duration-150">
      <div
        onClick={hasContent ? onToggle : undefined}
        className={cn("flex items-center gap-2.5 px-3 py-2.5 select-none", hasContent && "cursor-pointer")}
      >
        <FileText size={15} strokeWidth={1.7} className={empty ? "text-ink-muted" : "text-ink-secondary"} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[13px] font-semibold", empty ? "text-ink-muted" : "text-ink")}>
              {title}
            </span>
            {!empty && <StatusBadge tone="success">active</StatusBadge>}
          </div>
          <div className="text-[12px] text-ink-muted mt-0.5 truncate">{description}</div>
        </div>
        {hasContent && (
          <ChevronDown className={cn("h-3.5 w-3.5 text-ink-muted transition-transform duration-200", expanded && "rotate-180")} />
        )}
      </div>

      {location && (
        <div className="px-3 pb-2 text-[11px] font-mono text-ink-muted truncate">
          {location}
        </div>
      )}

      {expanded && hasContent && (
        <div className="border-t border-line p-3 max-h-[300px] overflow-auto">
          <pre className="text-[12px] font-mono text-ink-secondary whitespace-pre-wrap break-words m-0 leading-relaxed">
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
            <div className="text-[12.5px] text-ink-muted mb-1.5">Responsibilities</div>
            <div className="flex flex-wrap gap-1.5">
              {member.responsibilities.map((r: string, i: number) => (
                <StatusBadge key={i} tone="neutral">
                  {r}
                </StatusBadge>
              ))}
            </div>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Notes">
        {isEditing ? (
          <EditField label="" value={editForm.notes} onChange={(v) => onUpdateField("notes", v)} multiline placeholder="Add notes about this team member..." />
        ) : (
          <p className={cn("text-[13.5px]", meta.notes ? "text-ink" : "text-ink-muted")}>
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
    <div className="pt-5 pb-1 border-b border-line">
      <h3 className="text-[11.5px] font-semibold text-ink-muted uppercase tracking-[0.06em] mb-3">{title}</h3>
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
      <span className="text-[12.5px] text-ink-muted shrink-0">{label}</span>
      <span className={cn("text-[13.5px] text-ink text-right break-all max-w-[60%]", mono && "font-mono text-[12px]", valueClassName)}>
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
      {label && <label className="block text-[12.5px] text-ink-secondary mb-1">{label}</label>}
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-surface-1 border border-line rounded-lg text-[13.5px] text-ink placeholder:text-ink-muted outline-none resize-y font-[inherit] focus-visible:border-line-strong"
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

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => onSelect(node.id)}
        className={cn(
          "w-80 p-4 bg-surface-1 border rounded-xl cursor-pointer transition-colors duration-150 text-left hover:border-line-strong",
          isSelected ? "border-info-accent" : "border-line"
        )}
        aria-label={`${node.name}, ${node.role}`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center border border-line bg-surface-2 text-ink text-lg font-semibold shrink-0">
            {node.type === "human"
              ? node.avatar || node.name?.charAt(0)?.toUpperCase()
              : node.emoji || node.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-ink truncate">{node.name}</div>
            <div className="text-[12.5px] text-ink-muted truncate">
              {node.type === "human" ? node.role : `${node.agentRole} Agent`}
            </div>
          </div>
          {node.active && (
            <div className="h-2 w-2 rounded-full bg-ok shrink-0" aria-label="Active" />
          )}
        </div>

        {node.type === "human" && node.responsibilities && node.responsibilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {node.responsibilities.slice(0, 4).map((resp: string, i: number) => (
              <span key={i} className="px-2 py-1 bg-surface-2 border border-line rounded-md text-[11.5px] text-ink-secondary">
                {resp}
              </span>
            ))}
          </div>
        )}

        {node.type === "agent" && (
          <>
            {node.model && (
              <div className="mt-2 pt-3 border-t border-line">
                <div className="text-[13px] font-medium text-ink mb-1">{node.model}</div>
                {node.budgetPerRun !== undefined && (
                  <div className="text-[12px] text-ink-muted mt-0.5">
                    ${node.budgetPerRun.toFixed(0)} / ${(node.budgetPerRun / 1000000).toFixed(2)} per 1M tokens
                  </div>
                )}
              </div>
            )}
            {node.allowedTaskTypes && node.allowedTaskTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {node.allowedTaskTypes.slice(0, 4).map((cap: string, i: number) => (
                  <StatusBadge key={i} tone="neutral">
                    {cap}
                  </StatusBadge>
                ))}
                {node.allowedTaskTypes.length > 4 && (
                  <StatusBadge tone="neutral">
                    +{node.allowedTaskTypes.length - 4}
                  </StatusBadge>
                )}
              </div>
            )}
            {node.budgetDaily !== undefined && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="text-[12px] text-ink-muted mb-1.5">
                  Budget: ${node.spendToday?.toFixed(2) || 0} / ${node.budgetDaily.toFixed(0)}
                </div>
                <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      (node.spendToday || 0) / node.budgetDaily > 0.9 ? "bg-warn" : "bg-ok"
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
          <div className="w-px h-10 bg-line" />
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
