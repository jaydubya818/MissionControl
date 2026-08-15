import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "./Toast";
import {
  Bot,
  Edit3,
  FolderGit2,
  Route,
  Shield,
  User,
  Wallet,
} from "lucide-react";

type AgentRole = "INTERN" | "SPECIALIST" | "LEAD" | "CEO";

interface AgentForm {
  name: string;
  emoji: string;
  role: AgentRole;
  workspacePath: string;
  allowedTaskTypes: string;
  allowedTools: string;
  budgetDaily: string;
  budgetPerRun: string;
  canSpawn: boolean;
  maxSubAgents: string;
}

interface AgentSettingsPanelProps {
  agent: Doc<"agents">;
  projectId: Id<"projects">;
  effectiveModel: string;
  open: boolean;
  initialEditing?: boolean;
  onClose: () => void;
  onNavigateToIdentity?: () => void;
  onDeactivate?: () => void;
}

function formFromAgent(agent: Doc<"agents">): AgentForm {
  return {
    name: agent.name,
    emoji: agent.emoji ?? "",
    role: agent.role,
    workspacePath: agent.workspacePath,
    allowedTaskTypes: agent.allowedTaskTypes.join(", "),
    allowedTools: (agent.allowedTools ?? []).join(", "),
    budgetDaily: String(agent.budgetDaily),
    budgetPerRun: String(agent.budgetPerRun),
    canSpawn: agent.canSpawn,
    maxSubAgents: String(agent.maxSubAgents),
  };
}

function parseList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-line py-2.5 last:border-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`max-w-[65%] text-right text-[13px] text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface-1 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-ink-secondary">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export function AgentSettingsPanel({
  agent,
  projectId,
  effectiveModel,
  open,
  initialEditing = false,
  onClose,
  onNavigateToIdentity,
  onDeactivate,
}: AgentSettingsPanelProps) {
  const updateAgent = useMutation(api.agents.update);
  const setAgentOverride = useMutation(api.modelRoutingPolicies.setAgentOverride);
  const clearAgentOverride = useMutation(api.modelRoutingPolicies.clearAgentOverride);
  const modelCatalog = useQuery(api.modelCatalog.list, { projectId });
  const modelOverride = useQuery(api.modelRoutingPolicies.getAgentOverride, {
    projectId,
    agentId: agent._id,
  });
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(() => formFromAgent(agent));
  const [modelOverrideId, setModelOverrideId] = useState("INHERIT");
  const [modelOverrideTouched, setModelOverrideTouched] = useState(false);

  useEffect(() => {
    if (!editing) setForm(formFromAgent(agent));
  }, [agent, editing]);

  useEffect(() => {
    if (open) {
      setForm(formFromAgent(agent));
      setModelOverrideId(modelOverride?.modelId ?? "INHERIT");
      setModelOverrideTouched(false);
      setEditing(initialEditing);
      setError(null);
    } else {
      setEditing(false);
      setError(null);
    }
  }, [agent._id, initialEditing, open]);

  useEffect(() => {
    if (open && !modelOverrideTouched && modelOverride !== undefined) {
      setModelOverrideId(modelOverride?.modelId ?? "INHERIT");
    }
  }, [modelOverride, modelOverrideTouched, open]);

  const initialForm = useMemo(() => formFromAgent(agent), [agent]);
  const initialModelOverrideId = modelOverride?.modelId ?? "INHERIT";
  const dirty =
    JSON.stringify(form) !== JSON.stringify(initialForm) ||
    modelOverrideId !== initialModelOverrideId;

  function updateField<K extends keyof AgentForm>(key: K, value: AgentForm[K]) {
    setError(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function requestClose() {
    if (editing && dirty) {
      setError("Save or cancel your changes before closing.");
      return;
    }
    onClose();
  }

  async function save() {
    const budgetDaily = Number(form.budgetDaily);
    const budgetPerRun = Number(form.budgetPerRun);
    const maxSubAgents = Number(form.maxSubAgents);
    if (!form.name.trim()) return setError("Agent name is required.");
    if (!form.workspacePath.trim()) return setError("Workspace path is required.");
    if (!Number.isFinite(budgetDaily) || budgetDaily < 0) {
      return setError("Daily budget must be zero or greater.");
    }
    if (!Number.isFinite(budgetPerRun) || budgetPerRun < 0) {
      return setError("Per-run budget must be zero or greater.");
    }
    if (!Number.isInteger(maxSubAgents) || maxSubAgents < 0) {
      return setError("Maximum sub-agents must be a non-negative whole number.");
    }

    setSaving(true);
    setError(null);
    try {
      await updateAgent({
        agentId: agent._id,
        projectId,
        expectedConfigVersion: agent.configVersion ?? 0,
        name: form.name,
        emoji: form.emoji,
        role: form.role,
        workspacePath: form.workspacePath,
        allowedTaskTypes: parseList(form.allowedTaskTypes),
        allowedTools: parseList(form.allowedTools),
        budgetDaily,
        budgetPerRun,
        canSpawn: form.canSpawn,
        maxSubAgents,
      });
      if (modelOverrideId === "INHERIT" && modelOverride) {
        await clearAgentOverride({ projectId, agentId: agent._id });
      } else if (modelOverrideId !== "INHERIT" && modelOverrideId !== modelOverride?.modelId) {
        await setAgentOverride({
          projectId,
          agentId: agent._id,
          modelId: modelOverrideId,
          reason: "Operator configured agent-specific routing",
        });
      }
      setEditing(false);
      toast(`${form.name.trim()} updated`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-lg">
              {agent.emoji || <Bot className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle>{agent.name}</DialogTitle>
              <DialogDescription>
                {editing ? "Edit the configuration used for future assignments." : "Agent identity, routing, capability, and budget."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {editing ? (
          <div className="grid gap-5 py-2 md:grid-cols-2">
            <FormField label="Name">
              <Input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
            </FormField>
            <FormField label="Emoji">
              <Input value={form.emoji} onChange={(event) => updateField("emoji", event.target.value)} placeholder="🤖" />
            </FormField>
            <FormField label="Role">
              <Select value={form.role} onValueChange={(value) => updateField("role", value as AgentRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["INTERN", "SPECIALIST", "LEAD", "CEO"] as const).map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Workspace path">
              <Input className="font-mono" value={form.workspacePath} onChange={(event) => updateField("workspacePath", event.target.value)} />
            </FormField>
            <FormField label="Allowed task types" hint="Comma-separated. Leave empty to accept any task type.">
              <Input value={form.allowedTaskTypes} onChange={(event) => updateField("allowedTaskTypes", event.target.value)} placeholder="ENGINEERING, DOCS" />
            </FormField>
            <FormField label="Allowed tools" hint="Comma-separated tool allowlist.">
              <Input value={form.allowedTools} onChange={(event) => updateField("allowedTools", event.target.value)} placeholder="github, browser" />
            </FormField>
            <FormField label="Model routing" hint="Inherit the workspace policy unless this agent needs a justified exception.">
              <Select
                value={modelOverrideId}
                onValueChange={(value) => {
                  setModelOverrideId(value);
                  setModelOverrideTouched(true);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INHERIT">Inherit workspace policy</SelectItem>
                  {(modelCatalog ?? []).filter((model) => !model.deprecated && model.availability !== "UNAVAILABLE").map((model) => (
                    <SelectItem key={model._id} value={model.modelId}>
                      {model.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Daily budget">
              <Input type="number" min="0" step="0.01" value={form.budgetDaily} onChange={(event) => updateField("budgetDaily", event.target.value)} />
            </FormField>
            <FormField label="Per-run budget">
              <Input type="number" min="0" step="0.01" value={form.budgetPerRun} onChange={(event) => updateField("budgetPerRun", event.target.value)} />
            </FormField>
            <div className="space-y-4 md:col-span-2">
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={form.canSpawn}
                  onChange={(event) => updateField("canSpawn", event.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                Allow this agent to spawn sub-agents
              </label>
              {form.canSpawn && (
                <FormField label="Maximum sub-agents">
                  <Input className="max-w-40" type="number" min="0" step="1" value={form.maxSubAgents} onChange={(event) => updateField("maxSubAgents", event.target.value)} />
                </FormField>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 py-2 md:grid-cols-2">
            <Section icon={<User className="h-3.5 w-3.5" />} title="Identity">
              <dl>
                <DetailRow label="Role" value={agent.role} />
                <DetailRow label="Status" value={agent.status} />
                <DetailRow label="Agent ID" value={agent._id} mono />
              </dl>
              {onNavigateToIdentity && (
                <Button className="mt-2" size="sm" variant="outline" onClick={onNavigateToIdentity}>
                  Open identity record
                </Button>
              )}
            </Section>
            <Section icon={<Route className="h-3.5 w-3.5" />} title="Effective routing">
              <dl>
                <DetailRow label="Model" value={modelOverride?.modelId ?? effectiveModel} />
                <DetailRow label="Source" value={modelOverride ? "Agent override" : "Workspace default"} />
                <DetailRow label="Override" value={modelOverride?.reason ?? "None"} />
              </dl>
            </Section>
            <Section icon={<FolderGit2 className="h-3.5 w-3.5" />} title="Workspace">
              <dl>
                <DetailRow label="Path" value={agent.workspacePath} mono />
                <DetailRow label="Task types" value={agent.allowedTaskTypes.join(", ") || "Any"} />
              </dl>
            </Section>
            <Section icon={<Shield className="h-3.5 w-3.5" />} title="Capabilities">
              <dl>
                <DetailRow label="Tools" value={(agent.allowedTools ?? []).join(", ") || "No explicit allowlist"} />
                <DetailRow label="Can spawn" value={agent.canSpawn ? `Yes · up to ${agent.maxSubAgents}` : "No"} />
              </dl>
            </Section>
            <Section icon={<Wallet className="h-3.5 w-3.5" />} title="Budget">
              <dl>
                <DetailRow label="Daily" value={`$${agent.budgetDaily.toFixed(2)}`} />
                <DetailRow label="Per run" value={`$${agent.budgetPerRun.toFixed(2)}`} />
                <DetailRow label="Spent today" value={`$${agent.spendToday.toFixed(2)}`} />
              </dl>
            </Section>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12.5px] text-err">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!editing && onDeactivate && agent.status !== "DRAINED" && (
              <Button variant="outline" onClick={onDeactivate}>Deactivate</Button>
            )}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setForm(initialForm);
                    setModelOverrideId(initialModelOverrideId);
                    setModelOverrideTouched(false);
                    setEditing(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={saving || !dirty} onClick={save}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button onClick={() => setEditing(true)}>
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                  Edit agent
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
