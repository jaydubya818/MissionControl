import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

export function DeploymentsView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<Id<"environments"> | null>(null);
  const [selectedTargetVersionId, setSelectedTargetVersionId] = useState<Id<"agentVersions"> | null>(null);
  const [selectedPreviousVersionId, setSelectedPreviousVersionId] = useState<Id<"agentVersions"> | null>(null);

  const tenants = useQuery(api["registry/tenants"].listTenants, {
    activeOnly: false,
  });
  const templates = useQuery(api["registry/agentTemplates"].listTemplates, {
    tenantId: selectedTenantId ?? undefined,
    projectId: projectId ?? undefined,
    activeOnly: false,
  });
  const environments = useQuery(
    api["registry/environments"].listEnvironments,
    selectedTenantId ? { tenantId: selectedTenantId } : "skip"
  );
  const versions = useQuery(
    api["registry/agentVersions"].listVersions,
    selectedTemplateId ? { templateId: selectedTemplateId } : "skip"
  );
  const deployments = useQuery(api["governance/deployments"].listDeployments, {
    tenantId: selectedTenantId ?? undefined,
    templateId: selectedTemplateId ?? undefined,
  });

  const createDeployment = useMutation(api["governance/deployments"].createDeployment);
  const activateDeployment = useMutation(api["governance/deployments"].activateDeployment);
  const rollbackDeployment = useMutation(api["governance/deployments"].rollbackDeployment);

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
    if (!selectedEnvironmentId && environments && environments.length > 0) {
      setSelectedEnvironmentId(environments[0]._id);
    }
  }, [selectedEnvironmentId, environments]);

  useEffect(() => {
    if (!selectedTargetVersionId && versions && versions.length > 0) {
      setSelectedTargetVersionId(versions[0]._id);
    }
  }, [selectedTargetVersionId, versions]);

  const versionMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const version of versions ?? []) {
      map.set(version._id, version);
    }
    return map;
  }, [versions]);

  const environmentMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of environments ?? []) {
      map.set(row._id, row);
    }
    return map;
  }, [environments]);

  const handleCreateDeployment = async () => {
    if (!selectedTemplateId || !selectedEnvironmentId || !selectedTargetVersionId) {
      toast("Select tenant/template/environment/target version first.", true);
      return;
    }
    try {
      await createDeployment({
        tenantId: selectedTenantId ?? undefined,
        templateId: selectedTemplateId,
        environmentId: selectedEnvironmentId,
        targetVersionId: selectedTargetVersionId,
        previousVersionId: selectedPreviousVersionId ?? undefined,
        rolloutPolicy: {
          strategy: "all_at_once",
          maxUnavailable: 0,
        },
        metadata: {
          source: "deployments.ui",
        },
      });
      toast("Deployment created.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create deployment", true);
    }
  };

  const handleActivate = async (deploymentId: Id<"deployments">) => {
    try {
      await activateDeployment({ deploymentId });
      toast("Deployment activated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Activation failed", true);
    }
  };

  const handleRollback = async (deploymentId: Id<"deployments">) => {
    try {
      await rollbackDeployment({ deploymentId });
      toast("Rollback deployment created.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Rollback failed", true);
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">ARM Deployments</h2>
          <p className="text-sm text-muted-foreground">
            Promote approved versions through environments with activate and rollback controls.
          </p>
        </div>
      </div>

      <section className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Create Deployment
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <SelectPanel
            label="Tenant"
            value={selectedTenantId ?? ""}
            onChange={(value) => setSelectedTenantId(value as Id<"tenants">)}
            options={(tenants ?? []).map((row) => ({ value: row._id, label: row.name }))}
          />
          <SelectPanel
            label="Template"
            value={selectedTemplateId ?? ""}
            onChange={(value) => setSelectedTemplateId(value as Id<"agentTemplates">)}
            options={(templates ?? []).map((row) => ({ value: row._id, label: row.name }))}
          />
          <SelectPanel
            label="Environment"
            value={selectedEnvironmentId ?? ""}
            onChange={(value) => setSelectedEnvironmentId(value as Id<"environments">)}
            options={(environments ?? []).map((row) => ({ value: row._id, label: `${row.name} (${row.type})` }))}
          />
          <SelectPanel
            label="Target Version"
            value={selectedTargetVersionId ?? ""}
            onChange={(value) => setSelectedTargetVersionId(value as Id<"agentVersions">)}
            options={(versions ?? []).map((row) => ({ value: row._id, label: `v${row.version} (${row.status})` }))}
          />
          <SelectPanel
            label="Previous Version"
            value={selectedPreviousVersionId ?? ""}
            onChange={(value) => setSelectedPreviousVersionId((value || null) as Id<"agentVersions"> | null)}
            options={[
              { value: "", label: "None" },
              ...(versions ?? []).map((row) => ({ value: row._id, label: `v${row.version}` })),
            ]}
          />
        </div>
        <div className="mt-3">
          <Button size="sm" onClick={handleCreateDeployment}>
            Create Deployment
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deployment History
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Template</th>
                <th className="px-2 py-1">Environment</th>
                <th className="px-2 py-1">Target</th>
                <th className="px-2 py-1">Previous</th>
                <th className="px-2 py-1">Created</th>
                <th className="px-2 py-1">Activated</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(deployments ?? []).map((deployment) => (
                <tr key={deployment._id} className="border-t border-border">
                  <td className="px-2 py-2">
                    <StatusPill value={deployment.status} />
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{deployment.templateId}</td>
                  <td className="px-2 py-2">
                    {environmentMap.get(deployment.environmentId)?.name ?? deployment.environmentId}
                  </td>
                  <td className="px-2 py-2">
                    {versionLabel(versionMap.get(deployment.targetVersionId), deployment.targetVersionId)}
                  </td>
                  <td className="px-2 py-2">
                    {deployment.previousVersionId
                      ? versionLabel(versionMap.get(deployment.previousVersionId), deployment.previousVersionId)
                      : "n/a"}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(deployment.createdAt)}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(deployment.activatedAt)}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deployment.status !== "PENDING"}
                        onClick={() => handleActivate(deployment._id)}
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deployment.status !== "ACTIVE" || !deployment.previousVersionId}
                        onClick={() => handleRollback(deployment._id)}
                      >
                        Rollback
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(deployments ?? []).length === 0 && (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              No deployments found.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function versionLabel(version: any, fallbackId: string) {
  if (!version) return fallbackId;
  return `v${version.version} (${version.status})`;
}

function StatusPill({ value }: { value: string }) {
  const classes =
    value === "ACTIVE"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : value === "PENDING" || value === "ROLLING_BACK"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : "bg-secondary text-foreground border-border";

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
    <label className="text-sm">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <select
        className="w-full rounded border border-border bg-secondary px-2 py-1 text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select {label}</option>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
