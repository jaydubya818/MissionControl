/**
 * Policies View — Governance Dashboard
 *
 * Policy cards with scope badges, autonomy tier indicator, default decision.
 * Collapsed Evaluation Playground at bottom for dev testing.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/factory/badges";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Shield, Plus, FlaskConical } from "lucide-react";

function fmtTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

type RulesShape = {
  defaultDecision?: string;
  requireApprovalOnRisk?: string[];
  toolPolicies?: Record<string, string>;
  autonomyTier?: number;
  [key: string]: unknown;
};

const SELECT_CLASS =
  "mt-1 w-full h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PoliciesView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"agentVersions"> | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [toolName, setToolName] = useState("shell");
  const [riskLevel, setRiskLevel] = useState<"GREEN" | "YELLOW" | "RED">("YELLOW");

  const tenants = useQuery(api["registry/tenants"].listTenants, { activeOnly: false });
  const templates = useQuery(api["registry/agentTemplates"].listTemplates, {
    tenantId: selectedTenantId ?? undefined,
    projectId: projectId ?? undefined,
    activeOnly: false,
  });
  const versions = useQuery(
    api["registry/agentVersions"].listVersions,
    selectedTemplateId ? { templateId: selectedTemplateId } : "skip"
  );
  const envelopes = useQuery(api["governance/policyEnvelopes"].listPolicyEnvelopes, {
    tenantId: selectedTenantId ?? undefined,
    projectId: projectId ?? undefined,
    versionId: selectedVersionId ?? undefined,
    activeOnly,
  });
  const evalResult = useQuery(api["governance/policyEnvelopes"].evaluate, {
    tenantId: selectedTenantId ?? undefined,
    projectId: projectId ?? undefined,
    versionId: selectedVersionId ?? undefined,
    toolName: toolName || undefined,
    riskLevel,
  });

  const createPolicyEnvelope = useMutation(api["governance/policyEnvelopes"].createPolicyEnvelope);
  const attachPolicy = useMutation(api["governance/policyEnvelopes"].attachPolicy);

  useEffect(() => {
    if (!selectedTenantId && tenants?.length) setSelectedTenantId(tenants[0]._id);
  }, [selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTemplateId && templates?.length) setSelectedTemplateId(templates[0]._id);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedVersionId && versions?.length) setSelectedVersionId(versions[0]._id);
  }, [selectedVersionId, versions]);

  const handleCreatePolicy = async () => {
    try {
      const suffix = Date.now().toString().slice(-6);
      await createPolicyEnvelope({
        tenantId: selectedTenantId ?? undefined,
        projectId: projectId ?? undefined,
        templateId: selectedTemplateId ?? undefined,
        versionId: selectedVersionId ?? undefined,
        name: `Guardrail Policy ${suffix}`,
        priority: 100,
        rules: {
          defaultDecision: "ALLOW",
          requireApprovalOnRisk: ["RED"],
          toolPolicies: {
            shell: "NEEDS_APPROVAL",
            exec: "NEEDS_APPROVAL",
            write_file: "NEEDS_APPROVAL",
            delete_file: "DENY",
          },
        },
        metadata: { source: "policies.ui" },
      });
      toast("Policy created.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create policy", true);
    }
  };

  const togglePolicy = async (envelopeId: Id<"policyEnvelopes">, active: boolean) => {
    try {
      await attachPolicy({ envelopeId, active });
      toast(active ? "Policy activated." : "Policy deactivated.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update policy", true);
    }
  };

  const list = envelopes ?? [];
  const activeCount = list.filter((e) => e.active).length;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Policies"
        description="Version-aware guardrails (version → project → tenant precedence)"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveOnly((v) => !v)}>
              {activeOnly ? "Show All" : "Active Only"}
            </Button>
            <Button size="sm" onClick={handleCreatePolicy}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Policy
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2">
          <Shield size={15} strokeWidth={1.7} className="text-ink-muted" aria-hidden />
          <span className="text-[13.5px] font-semibold text-ink font-mono">{list.length}</span>
          <span className="text-[12.5px] text-ink-muted">total policies</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2">
          <span className="text-[13.5px] font-semibold text-ok font-mono">{activeCount}</span>
          <span className="text-[12.5px] text-ink-muted">active</span>
        </div>
      </div>

      {/* Scope filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Tenant</span>
          <select
            value={selectedTenantId ?? ""}
            onChange={(e) => setSelectedTenantId((e.target.value || null) as Id<"tenants"> | null)}
            className={SELECT_CLASS}
          >
            <option value="">Any</option>
            {(tenants ?? []).map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Template</span>
          <select
            value={selectedTemplateId ?? ""}
            onChange={(e) => setSelectedTemplateId((e.target.value || null) as Id<"agentTemplates"> | null)}
            className={SELECT_CLASS}
          >
            <option value="">Any</option>
            {(templates ?? []).map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Version</span>
          <select
            value={selectedVersionId ?? ""}
            onChange={(e) => setSelectedVersionId((e.target.value || null) as Id<"agentVersions"> | null)}
            className={SELECT_CLASS}
          >
            <option value="">Any</option>
            {(versions ?? []).map((v) => (
              <option key={v._id} value={v._id}>v{v.version} ({v.status})</option>
            ))}
          </select>
        </label>
      </div>

      {/* Policy cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((envelope) => {
          const rules = (envelope.rules ?? {}) as RulesShape;
          const defaultDecision = rules.defaultDecision ?? "ALLOW";
          const autonomyTier = typeof rules.autonomyTier === "number" ? rules.autonomyTier : 3;
          const toolCount = rules.toolPolicies ? Object.keys(rules.toolPolicies).length : 0;
          const scope = envelope.versionId ? "Version" : envelope.projectId ? "Project" : envelope.tenantId ? "Tenant" : "Global";

          return (
            <Card key={envelope._id} className="p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-ink leading-tight text-[15px]">{envelope.name}</h3>
                <StatusBadge
                  tone={envelope.active ? "success" : "neutral"}
                  className="shrink-0"
                >
                  {envelope.active ? "Active" : "Inactive"}
                </StatusBadge>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <StatusBadge tone="neutral">{scope}</StatusBadge>
                <StatusBadge
                  tone={
                    defaultDecision === "ALLOW"
                      ? "success"
                      : defaultDecision === "DENY"
                        ? "error"
                        : defaultDecision === "NEEDS_APPROVAL"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {defaultDecision}
                </StatusBadge>
              </div>
              {/* Autonomy tier 0–5 */}
              <div className="mb-3">
                <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-1.5">
                  Autonomy tier
                </div>
                <div className="flex gap-0.5">
                  {[0, 1, 2, 3, 4, 5].map((tier) => (
                    <div
                      key={tier}
                      className={cn(
                        "h-2 flex-1 rounded-sm border transition-colors duration-150",
                        tier <= autonomyTier
                          ? "bg-act border-transparent"
                          : "bg-surface-2 border-line"
                      )}
                      title={`Tier ${tier}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-[11.5px] text-ink-muted mb-3">
                {toolCount > 0 ? `${toolCount} tool rule${toolCount !== 1 ? "s" : ""}` : "No tool rules"}
                {rules.requireApprovalOnRisk?.length ? ` · Approval on ${rules.requireApprovalOnRisk.join(", ")}` : ""}
              </div>
              <div className="text-[11.5px] text-ink-muted mt-auto">
                Updated {fmtTime(envelope.updatedAt)}
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => togglePolicy(envelope._id, !envelope.active)}
                >
                  {envelope.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {list.length === 0 && (
        <div className="text-center py-12 text-ink-muted text-[13.5px]">
          No policies match the current scope. Create one or change filters.
        </div>
      )}

      {/* Collapsed Evaluation Playground */}
      <div>
        <button
          type="button"
          onClick={() => setPlaygroundOpen((o) => !o)}
          className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted hover:text-ink transition-colors duration-150"
        >
          {playgroundOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <FlaskConical className="h-3.5 w-3.5" />
          Evaluation Playground
        </button>
        {playgroundOpen && (
          <Card className="mt-2 p-4">
            <div className="text-[15px] font-semibold text-ink mb-3">
              Test policy evaluation
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                Tool
                <input
                  className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  placeholder="shell"
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-ink-secondary">
                Risk
                <select
                  className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as "GREEN" | "YELLOW" | "RED")}
                >
                  <option value="GREEN">GREEN</option>
                  <option value="YELLOW">YELLOW</option>
                  <option value="RED">RED</option>
                </select>
              </label>
              <div className="rounded-lg border border-line bg-surface-2 p-2.5 text-[13px]">
                <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Decision</div>
                <div className={cn(
                  "mt-1 font-semibold",
                  evalResult?.decision === "ALLOW" && "text-ok",
                  evalResult?.decision === "DENY" && "text-err",
                  evalResult?.decision === "NEEDS_APPROVAL" && "text-warn"
                )}>
                  {evalResult?.decision ?? "…"}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-2.5 text-[13px]">
                <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Source</div>
                <div className="mt-1 font-medium text-ink-secondary">{evalResult?.source ?? "…"}</div>
              </div>
            </div>
          </Card>
        )}
      </div>
      </div>
    </main>
  );
}
