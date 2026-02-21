import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useToast } from "./Toast";

function fmtTime(ts?: number) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

export function DirectoryView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isTenantBackfilling, setIsTenantBackfilling] = useState(false);

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
  const instances = useQuery(api["registry/agentInstances"].listInstances, {
    projectId: projectId ?? undefined,
  });
  const identities = useQuery(api["registry/agentIdentities"].listIdentities, {
    tenantId: selectedTenantId ?? undefined,
  });
  const environments = useQuery(
    api["registry/environments"].listEnvironments,
    selectedTenantId ? { tenantId: selectedTenantId } : "skip"
  );
  const operators = useQuery(
    api["registry/operators"].listOperators,
    selectedTenantId ? { tenantId: selectedTenantId, activeOnly: false } : "skip"
  );
  const roles = useQuery(
    api["governance/roles"].listRoles,
    selectedTenantId ? { tenantId: selectedTenantId } : "skip"
  );
  const migrationHealth = useQuery(api["migrations/backfillInstanceRefs"].getMigrationHealth, {});

  const createTenant = useMutation(api["registry/tenants"].createTenant);
  const createEnvironment = useMutation(api["registry/environments"].createEnvironment);
  const createOperator = useMutation(api["registry/operators"].createOperator);
  const createTemplate = useMutation(api["registry/agentTemplates"].createTemplate);
  const createVersion = useMutation(api["registry/agentVersions"].createVersion);
  const transitionVersion = useMutation(api["registry/agentVersions"].transitionVersion);
  const createInstance = useMutation(api["registry/agentInstances"].createInstance);
  const transitionInstance = useMutation(api["registry/agentInstances"].transitionInstance);
  const seedMissionControlDemo = useMutation(api.seedMissionControlDemo.run);
  const runInstanceRefBackfill = useAction(api["migrations/backfillInstanceRefs"].runBackfill);
  const runTenantBackfill = useAction(api["migrations/backfillInstanceRefs"].runTenantBackfill);

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

  const approvedVersion = useMemo(
    () => (versions ?? []).find((row) => row.status === "APPROVED") ?? (versions ?? [])[0],
    [versions]
  );

  const handleBootstrapTenant = async () => {
    try {
      const suffix = Date.now().toString().slice(-6);
      const tenant = await createTenant({
        name: `SellerFi Tenant ${suffix}`,
        slug: `sellerfi-${suffix}`,
        description: "Created from ARM Directory UI",
      });

      await Promise.all([
        createEnvironment({ tenantId: tenant._id, name: "Development", type: "dev" }),
        createEnvironment({ tenantId: tenant._id, name: "Staging", type: "staging" }),
        createEnvironment({ tenantId: tenant._id, name: "Production", type: "prod" }),
      ]);
      await createOperator({
        tenantId: tenant._id,
        email: `operator+${suffix}@sellerfi.local`,
        name: `Operator ${suffix}`,
      });

      setSelectedTenantId(tenant._id);
      toast("Tenant, environments, and operator created.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bootstrap failed", true);
    }
  };

  const handleCreateTemplateStack = async () => {
    if (!selectedTenantId) {
      toast("Create or select a tenant first.", true);
      return;
    }
    try {
      const suffix = Date.now().toString().slice(-6);
      const template = await createTemplate({
        tenantId: selectedTenantId,
        projectId: projectId ?? undefined,
        name: `MC Agent Template ${suffix}`,
        slug: `mc-agent-${suffix}`,
        description: "Created from ARM Directory UI",
      });
      const version = await createVersion({
        tenantId: selectedTenantId,
        projectId: projectId ?? undefined,
        templateId: template._id,
        status: "DRAFT",
        genome: {
          modelConfig: {
            provider: "openai",
            modelId: "gpt-4.1",
            temperature: 0.2,
            maxTokens: 4096,
          },
          promptBundleHash: `prompt-${suffix}`,
          toolManifestHash: `tools-${suffix}`,
          provenance: {
            createdBy: "mission-control-ui",
            source: "directory.bootstrap",
            createdAt: Date.now(),
          },
        },
        notes: "Initial local test version",
      });
      await transitionVersion({
        versionId: version._id,
        status: "APPROVED",
        notes: "Approved for local testing",
      });

      const instance = await createInstance({
        tenantId: selectedTenantId,
        projectId: projectId ?? undefined,
        templateId: template._id,
        versionId: version._id,
        environmentId: environments?.[0]?._id,
        name: `Instance ${suffix}`,
      });
      await transitionInstance({
        instanceId: instance._id,
        status: "ACTIVE",
      });

      setSelectedTemplateId(template._id);
      toast("Template, version, and instance created.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Template stack creation failed", true);
    }
  };

  const handleSeedMissionControlDemo = async () => {
    try {
      setIsSeedingDemo(true);
      const result = await seedMissionControlDemo({});
      const counts = Object.entries(result.counts ?? {})
        .map(([key, value]) => `${key}:${value}`)
        .join(" ");
      toast(`Demo data seeded. ${counts}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to seed mission control demo data", true);
    } finally {
      setIsSeedingDemo(false);
    }
  };

  const handleRunBackfill = async () => {
    try {
      setIsBackfilling(true);
      let tasksOffset = 0;
      let runsOffset = 0;
      let toolCallsOffset = 0;
      let messagesOffset = 0;
      let pass = 0;
      let totalUpdated = {
        tasks: 0,
        runs: 0,
        toolCalls: 0,
        messages: 0,
      };
      let finished = false;

      while (pass < 50) {
        const result = await runInstanceRefBackfill({
          batchSize: 100,
          tasksOffset,
          runsOffset,
          toolCallsOffset,
          messagesOffset,
        });

        totalUpdated = {
          tasks: totalUpdated.tasks + (result.updated.tasks ?? 0),
          runs: totalUpdated.runs + (result.updated.runs ?? 0),
          toolCalls: totalUpdated.toolCalls + (result.updated.toolCalls ?? 0),
          messages: totalUpdated.messages + (result.updated.messages ?? 0),
        };

        if (result.done) {
          finished = true;
          break;
        }

        tasksOffset = result.next.tasksOffset ?? tasksOffset;
        runsOffset = result.next.runsOffset ?? runsOffset;
        toolCallsOffset = result.next.toolCallsOffset ?? toolCallsOffset;
        messagesOffset = result.next.messagesOffset ?? messagesOffset;
        pass += 1;
      }

      if (finished) {
        toast(
          `Backfill complete. tasks:${totalUpdated.tasks} runs:${totalUpdated.runs} toolCalls:${totalUpdated.toolCalls} messages:${totalUpdated.messages}`
        );
      } else {
        toast(
          `Backfill reached batch cap; run again to continue. tasks:${totalUpdated.tasks} runs:${totalUpdated.runs} toolCalls:${totalUpdated.toolCalls} messages:${totalUpdated.messages}`,
          true
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Backfill failed", true);
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleRunTenantBackfill = async () => {
    try {
      setIsTenantBackfilling(true);
      let projectsOffset = 0;
      let agentsOffset = 0;
      let tasksOffset = 0;
      let runsOffset = 0;
      let toolCallsOffset = 0;
      let messagesOffset = 0;
      let approvalsOffset = 0;
      let pass = 0;
      let finished = false;
      let totalUpdated = {
        projects: 0,
        agents: 0,
        tasks: 0,
        runs: 0,
        toolCalls: 0,
        messages: 0,
        approvals: 0,
      };

      while (pass < 50) {
        const result = await runTenantBackfill({
          batchSize: 100,
          projectsOffset,
          agentsOffset,
          tasksOffset,
          runsOffset,
          toolCallsOffset,
          messagesOffset,
          approvalsOffset,
        });

        totalUpdated = {
          projects: totalUpdated.projects + (result.updated.projects ?? 0),
          agents: totalUpdated.agents + (result.updated.agents ?? 0),
          tasks: totalUpdated.tasks + (result.updated.tasks ?? 0),
          runs: totalUpdated.runs + (result.updated.runs ?? 0),
          toolCalls: totalUpdated.toolCalls + (result.updated.toolCalls ?? 0),
          messages: totalUpdated.messages + (result.updated.messages ?? 0),
          approvals: totalUpdated.approvals + (result.updated.approvals ?? 0),
        };

        if (result.done) {
          finished = true;
          break;
        }

        projectsOffset = result.next.projectsOffset ?? projectsOffset;
        agentsOffset = result.next.agentsOffset ?? agentsOffset;
        tasksOffset = result.next.tasksOffset ?? tasksOffset;
        runsOffset = result.next.runsOffset ?? runsOffset;
        toolCallsOffset = result.next.toolCallsOffset ?? toolCallsOffset;
        messagesOffset = result.next.messagesOffset ?? messagesOffset;
        approvalsOffset = result.next.approvalsOffset ?? approvalsOffset;
        pass += 1;
      }

      if (finished) {
        toast(
          `Tenant backfill complete. projects:${totalUpdated.projects} agents:${totalUpdated.agents} tasks:${totalUpdated.tasks} runs:${totalUpdated.runs} toolCalls:${totalUpdated.toolCalls} messages:${totalUpdated.messages} approvals:${totalUpdated.approvals}`
        );
      } else {
        toast(
          `Tenant backfill reached batch cap; run again to continue. projects:${totalUpdated.projects} agents:${totalUpdated.agents} tasks:${totalUpdated.tasks} runs:${totalUpdated.runs} toolCalls:${totalUpdated.toolCalls} messages:${totalUpdated.messages} approvals:${totalUpdated.approvals}`,
          true
        );
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Tenant backfill failed", true);
    } finally {
      setIsTenantBackfilling(false);
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">ARM Directory</h2>
          <p className="text-sm text-muted-foreground">
            Multi-tenant registry: tenants, environments, operators, templates, versions, and instances.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleBootstrapTenant}>
            Bootstrap Tenant
          </Button>
          <Button size="sm" onClick={handleCreateTemplateStack}>
            Create Template Stack
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tenants" value={(tenants ?? []).length} />
        <Stat label="Templates" value={(templates ?? []).length} />
        <Stat label="Instances" value={(instances ?? []).length} />
        <Stat label="Identities" value={(identities ?? []).length} />
      </div>

      <section className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Migration Ops</div>
            <div className="text-sm text-muted-foreground">
              Seed dense demo data and backfill legacy agent refs into ARM instance/version fields.
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleSeedMissionControlDemo} disabled={isSeedingDemo}>
              {isSeedingDemo ? "Seeding..." : "Seed Mission Control Demo"}
            </Button>
            <Button size="sm" onClick={handleRunBackfill} disabled={isBackfilling}>
              {isBackfilling ? "Backfilling..." : "Run Instance Ref Backfill"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRunTenantBackfill} disabled={isTenantBackfilling}>
              {isTenantBackfilling ? "Backfilling Tenants..." : "Run Tenant Backfill"}
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Missing Task Refs"
            value={migrationHealth?.missingInstanceRefs.tasks ?? 0}
          />
          <Stat
            label="Missing Run Refs"
            value={migrationHealth?.missingInstanceRefs.runs ?? 0}
          />
          <Stat
            label="Missing ToolCall Refs"
            value={migrationHealth?.missingInstanceRefs.toolCalls ?? 0}
          />
          <Stat
            label="Missing Message Refs"
            value={migrationHealth?.missingInstanceRefs.messages ?? 0}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MiniList
            title={`Compat Mode: ${migrationHealth?.armCompatMode ?? "..."}`}
            rows={[
              `tasks total: ${migrationHealth?.totalRecords.tasks ?? 0}`,
              `runs total: ${migrationHealth?.totalRecords.runs ?? 0}`,
              `toolCalls total: ${migrationHealth?.totalRecords.toolCalls ?? 0}`,
              `messages total: ${migrationHealth?.totalRecords.messages ?? 0}`,
            ]}
            empty="No migration data."
          />
          <MiniList
            title="Missing Tenant IDs"
            rows={[
              `projects: ${migrationHealth?.missingTenant.projects ?? 0}`,
              `agents: ${migrationHealth?.missingTenant.agents ?? 0}`,
              `tasks: ${migrationHealth?.missingTenant.tasks ?? 0}`,
              `runs: ${migrationHealth?.missingTenant.runs ?? 0}`,
              `toolCalls: ${migrationHealth?.missingTenant.toolCalls ?? 0}`,
              `messages: ${migrationHealth?.missingTenant.messages ?? 0}`,
              `approvals: ${migrationHealth?.missingTenant.approvals ?? 0}`,
            ]}
            empty="No tenant gaps."
          />
          <div className="rounded border border-border bg-secondary p-3 text-sm text-muted-foreground">
            Health metrics auto-refresh with Convex subscriptions as writes complete.
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-md border border-border bg-card p-4 xl:col-span-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenants</div>
          <div className="max-h-[300px] space-y-2 overflow-auto">
            {(tenants ?? []).map((tenant) => (
              <button
                key={tenant._id}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  selectedTenantId === tenant._id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-foreground"
                }`}
                onClick={() => setSelectedTenantId(tenant._id)}
              >
                <div className="font-medium">{tenant.name}</div>
                <div className="text-xs text-muted-foreground">{tenant.slug}</div>
              </button>
            ))}
            {(tenants ?? []).length === 0 && (
              <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
                No tenants yet. Click Bootstrap Tenant.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tenant Details
            </div>
            {selectedTenantId && (
              <span className="text-xs text-muted-foreground">Tenant ID: {selectedTenantId}</span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MiniList
              title="Environments"
              rows={(environments ?? []).map((row) => `${row.name} (${row.type})`)}
              empty="No environments."
            />
            <MiniList
              title="Operators"
              rows={(operators ?? []).map((row) => `${row.name} • ${row.email}`)}
              empty="No operators."
            />
            <MiniList
              title="Roles"
              rows={(roles ?? []).map((row) => `${row.name} (${row.permissions?.length ?? 0} perms)`)}
              empty="No roles."
            />
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4 xl:col-span-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Templates</div>
          <div className="max-h-[260px] space-y-2 overflow-auto">
            {(templates ?? []).map((template) => (
              <button
                key={template._id}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  selectedTemplateId === template._id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary text-foreground"
                }`}
                onClick={() => setSelectedTemplateId(template._id)}
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-xs text-muted-foreground">
                  {template.slug} • updated {fmtTime(template.updatedAt)}
                </div>
              </button>
            ))}
            {(templates ?? []).length === 0 && (
              <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
                No templates yet. Click Create Template Stack.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4 xl:col-span-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versions</div>
          <div className="space-y-2">
            {(versions ?? []).map((version) => (
              <div key={version._id} className="rounded border border-border bg-secondary px-3 py-2 text-sm">
                <div className="font-medium">
                  v{version.version} <StatusPill value={version.status} />
                </div>
                <div className="text-xs text-muted-foreground">{version.genomeHash}</div>
              </div>
            ))}
            {(versions ?? []).length === 0 && (
              <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
                Select a template to view versions.
              </div>
            )}
          </div>
          {approvedVersion && (
            <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">
              Active candidate: v{approvedVersion.version} ({approvedVersion.status})
            </div>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-4 xl:col-span-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instances</div>
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Template</th>
                  <th className="px-2 py-1">Version</th>
                  <th className="px-2 py-1">Legacy Agent</th>
                  <th className="px-2 py-1">Activated</th>
                </tr>
              </thead>
              <tbody>
                {(instances ?? []).map((instance) => (
                  <tr key={instance._id} className="border-t border-border">
                    <td className="px-2 py-2">{instance.name}</td>
                    <td className="px-2 py-2">
                      <StatusPill value={instance.status} />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{instance.templateId}</td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{instance.versionId}</td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{instance.legacyAgentId ?? "n/a"}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{fmtTime(instance.activatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(instances ?? []).length === 0 && (
              <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
                No instances yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const classes =
    value === "ACTIVE" || value === "APPROVED"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : value === "PENDING" || value === "PROVISIONING" || value === "DRAFT"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : value === "DENIED" || value === "FAILED" || value === "RETIRED"
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : "bg-secondary text-foreground border-border";

  return <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classes}`}>{value}</span>;
}

function MiniList({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <div className="rounded border border-border bg-secondary p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-1 text-sm text-foreground">
          {rows.map((row, index) => (
            <div key={`${title}-${index}`}>{row}</div>
          ))}
        </div>
      )}
    </div>
  );
}
