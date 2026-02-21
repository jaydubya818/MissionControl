import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

export function PoliciesView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"agentVersions"> | null>(null);
  const [toolName, setToolName] = useState("shell");
  const [riskLevel, setRiskLevel] = useState<"GREEN" | "YELLOW" | "RED">("YELLOW");
  const [activeOnly, setActiveOnly] = useState(true);

  const tenants = useQuery(api["registry/tenants"].listTenants, {
    activeOnly: false,
  });
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
    if (!selectedTenantId && tenants && tenants.length > 0) {
      setSelectedTenantId(tenants[0]._id);
    }
  }, [selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTemplateId && templates && templates.length > 0) {
      setSelectedTemplateId(templates[0]._id);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedVersionId && versions && versions.length > 0) {
      setSelectedVersionId(versions[0]._id);
    }
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
        metadata: {
          source: "policies.ui",
        },
      });
      toast("Policy envelope created.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create policy", true);
    }
  };

  const togglePolicy = async (envelopeId: Id<"policyEnvelopes">, active: boolean) => {
    try {
      await attachPolicy({ envelopeId, active });
      toast(active ? "Policy activated." : "Policy deactivated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update policy state", true);
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">ARM Policies</h2>
          <p className="text-sm text-muted-foreground">
            Version-aware guardrails via policy envelopes (version &gt; project &gt; tenant precedence).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveOnly((v) => !v)}>
            {activeOnly ? "Show All" : "Show Active Only"}
          </Button>
          <Button size="sm" onClick={handleCreatePolicy}>
            Create Guardrail Policy
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <SelectPanel
          label="Tenant"
          value={selectedTenantId ?? ""}
          onChange={(value) => setSelectedTenantId(value as Id<"tenants">)}
          options={(tenants ?? []).map((tenant) => ({ value: tenant._id, label: tenant.name }))}
        />
        <SelectPanel
          label="Template"
          value={selectedTemplateId ?? ""}
          onChange={(value) => setSelectedTemplateId(value as Id<"agentTemplates">)}
          options={(templates ?? []).map((template) => ({ value: template._id, label: template.name }))}
        />
        <SelectPanel
          label="Version"
          value={selectedVersionId ?? ""}
          onChange={(value) => setSelectedVersionId(value as Id<"agentVersions">)}
          options={(versions ?? []).map((version) => ({
            value: version._id,
            label: `v${version.version} (${version.status})`,
          }))}
        />
      </div>

      <section className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evaluator Probe</div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            Tool
            <input
              className="rounded border border-border bg-secondary px-2 py-1 text-foreground"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="shell"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Risk
            <select
              className="rounded border border-border bg-secondary px-2 py-1 text-foreground"
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value as "GREEN" | "YELLOW" | "RED")}
            >
              <option value="GREEN">GREEN</option>
              <option value="YELLOW">YELLOW</option>
              <option value="RED">RED</option>
            </select>
          </label>
          <div className="rounded border border-border bg-secondary p-2 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Decision</div>
            <div className="mt-1 font-semibold text-foreground">{evalResult?.decision ?? "..."}</div>
          </div>
          <div className="rounded border border-border bg-secondary p-2 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Source</div>
            <div className="mt-1 font-semibold text-foreground">{evalResult?.source ?? "..."}</div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Policy Envelopes</div>
        <div className="overflow-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Active</th>
                <th className="px-2 py-1">Priority</th>
                <th className="px-2 py-1">Scope</th>
                <th className="px-2 py-1">Updated</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(envelopes ?? []).map((envelope) => (
                <tr key={envelope._id} className="border-t border-border">
                  <td className="px-2 py-2">{envelope.name}</td>
                  <td className="px-2 py-2">
                    <StatusPill value={envelope.active ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td className="px-2 py-2">{envelope.priority ?? 100}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {envelope.versionId ? "Version" : envelope.projectId ? "Project" : envelope.tenantId ? "Tenant" : "Global"}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(envelope.updatedAt)}</td>
                  <td className="px-2 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => togglePolicy(envelope._id, !envelope.active)}
                    >
                      {envelope.active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(envelopes ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No policy envelopes found.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusPill({ value }: { value: string }) {
  const classes =
    value === "ACTIVE"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classes}`}>{value}</span>;
}

function SelectPanel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <select
        className="w-full rounded border border-border bg-secondary px-2 py-1 text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select {label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
