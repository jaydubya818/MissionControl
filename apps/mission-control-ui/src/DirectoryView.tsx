/**
 * Templates View (ARM Template Registry)
 *
 * Master/detail: template list on the left, version lineage and instances on the right.
 * Version lifecycle steps, genome hash with copy, and instances for the selected template/version.
 */

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Copy,
  Layers,
  Server,
  Box,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const VERSION_LIFECYCLE = ["DRAFT", "TESTING", "CANDIDATE", "APPROVED", "DEPRECATED", "RETIRED"] as const;

const VERSION_STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  DRAFT: "neutral",
  TESTING: "warning",
  CANDIDATE: "info",
  APPROVED: "success",
  DEPRECATED: "neutral",
  RETIRED: "error",
};

const INSTANCE_STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  PROVISIONING: "warning",
  ACTIVE: "success",
  PAUSED: "neutral",
  READONLY: "info",
  DRAINING: "warning",
  QUARANTINED: "error",
  RETIRED: "neutral",
};

function fmtTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => toast("Copied to clipboard"),
          () => toast("Copy failed", true)
        );
      }}
      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono text-ink-muted hover:text-ink hover:border-line-strong transition-colors duration-150"
      title="Copy"
    >
      <Copy className="h-2.5 w-2.5" />
      {label ?? value.slice(0, 12)}
    </button>
  );
}

export function DirectoryView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isTenantBackfilling, setIsTenantBackfilling] = useState(false);

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
  const instances = useQuery(api["registry/agentInstances"].listInstances, {
    projectId: projectId ?? undefined,
  });
  const environments = useQuery(
    api["registry/environments"].listEnvironments,
    selectedTenantId ? { tenantId: selectedTenantId } : "skip"
  );
  // Demo seeding and tenant/instance backfills rewrite rows across the whole
  // deployment — including reassigning `tenantId`, which moves records between
  // companies. They are `internal*` functions with no browser binding on
  // purpose; operators run them through `npx convex run`, which authenticates
  // with deployment admin credentials.

  useEffect(() => {
    if (!selectedTenantId && tenants && tenants.length > 0) setSelectedTenantId(tenants[0]._id);
  }, [selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTemplateId && templates && templates.length > 0) setSelectedTemplateId(templates[0]._id);
  }, [selectedTemplateId, templates]);

  const approvedVersion = useMemo(
    () => (versions ?? []).find((r) => r.status === "APPROVED") ?? (versions ?? [])[0],
    [versions]
  );

  const instancesForTemplate = useMemo(() => {
    if (!instances || !selectedTemplateId) return [];
    return instances.filter((i) => i.templateId === selectedTemplateId);
  }, [instances, selectedTemplateId]);

  const instancesByVersion = useMemo(() => {
    const map = new Map<string, typeof instances>();
    for (const inst of instancesForTemplate) {
      const vid = inst.versionId;
      if (!map.has(vid)) map.set(vid, []);
      map.get(vid)!.push(inst);
    }
    return map;
  }, [instancesForTemplate]);

  const environmentMap = useMemo(() => {
    const map = new Map<Id<"environments">, { name: string; type: string }>();
    for (const e of environments ?? []) map.set(e._id, { name: e.name, type: e.type });
    return map;
  }, [environments]);




  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Templates"
        description="ARM template registry: version lineage and instances"
        actions={
          <Button size="sm" variant="outline" disabled>
            <Box className="h-3.5 w-3.5 mr-1.5" />
            New Template (coming soon)
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Tenant</span>
        <select
          value={selectedTenantId ?? ""}
          onChange={(e) => setSelectedTenantId((e.target.value || null) as Id<"tenants"> | null)}
          className="h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select tenant</option>
          {(tenants ?? []).map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
        {environments && environments.length > 0 && (
          <>
            <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted ml-2">Environments</span>
            <span className="text-[12.5px] text-ink-secondary">
              {(environments ?? []).map((e) => e.name).join(", ")}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Template list (master) */}
        <Card className="p-4 lg:col-span-1">
          <div className="text-[15px] font-semibold text-ink mb-3">
            Template list
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {(templates ?? []).map((template) => {
              const isSelected = selectedTemplateId === template._id;
              const versionCount = isSelected ? (versions ?? []).length : null;
              const instCount = isSelected ? instancesForTemplate.length : null;
              return (
                <button
                  key={template._id}
                  onClick={() => setSelectedTemplateId(template._id)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left transition-colors duration-150",
                    isSelected
                      ? "border-line-strong bg-surface-2 text-ink"
                      : "border-line text-ink-secondary hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Layers size={14} strokeWidth={1.7} className="shrink-0" aria-hidden />
                    <span className="font-medium truncate text-[13.5px]">{template.name}</span>
                  </div>
                  {(versionCount !== null || instCount !== null) && (
                    <div className="text-[11.5px] text-ink-muted mt-0.5">
                      {versionCount != null && `${versionCount} version${versionCount !== 1 ? "s" : ""}`}
                      {versionCount != null && instCount != null && instCount > 0 && " · "}
                      {instCount != null && instCount > 0 && `${instCount} instance${instCount !== 1 ? "s" : ""}`}
                    </div>
                  )}
                </button>
              );
            })}
            {(templates ?? []).length === 0 && (
              <div className="rounded-lg border border-dashed border-line p-4 text-center text-[13.5px] text-ink-muted">
                No templates. Use Dev Tools below to seed demo data.
              </div>
            )}
          </div>
        </Card>

        {/* Version lineage + instances (detail) */}
        <div className="lg:col-span-2 space-y-4">
          {selectedTemplateId ? (
            <>
              <Card className="p-4">
                <div className="text-[15px] font-semibold text-ink mb-3">
                  Version lineage
                </div>
                {/* Lifecycle step indicator */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {VERSION_LIFECYCLE.map((step) => (
                    <span
                      key={step}
                      className="text-[11px] font-medium text-ink-muted"
                    >
                      {step}
                      {step !== "RETIRED" && <ChevronRight className="inline h-2.5 w-2.5 ml-0.5 align-middle" />}
                    </span>
                  ))}
                </div>
                <div className="space-y-3">
                  {(versions ?? []).map((version) => {
                    const isApproved = version.status === "APPROVED";
                    const instList = instancesByVersion.get(version._id) ?? [];
                    return (
                      <div
                        key={version._id}
                        className={cn(
                          "rounded-lg border p-3",
                          isApproved ? "border-line-strong bg-surface-2" : "border-line"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink font-mono text-[13px]">v{version.version}</span>
                            <StatusBadge tone={VERSION_STATUS_TONE[version.status] ?? "neutral"}>
                              {version.status}
                            </StatusBadge>
                            {isApproved && (
                              <span className="text-[11.5px] text-ink-secondary font-medium">current</span>
                            )}
                          </div>
                          <CopyButton value={version.genomeHash} label={`${version.genomeHash.slice(0, 12)}…`} />
                        </div>
                        <div className="text-[11.5px] text-ink-muted mt-1.5 font-mono">
                          genome: {version.genomeHash.slice(0, 12)}…
                        </div>
                        {version.notes && (
                          <p className="text-[12.5px] text-ink-secondary mt-1.5">{version.notes}</p>
                        )}
                        {instList.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-line">
                            <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">
                              Instances ({instList.length})
                            </div>
                            <div className="space-y-1.5">
                              {instList.map((inst) => {
                                const env = inst.environmentId ? environmentMap.get(inst.environmentId) : null;
                                return (
                                  <div
                                    key={inst._id}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12.5px]"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Server size={12} strokeWidth={1.7} className="text-ink-muted shrink-0" aria-hidden />
                                      <span className="truncate text-ink">{inst.name}</span>
                                      {env && (
                                        <span className="text-[11.5px] text-ink-muted shrink-0">{env.name}</span>
                                      )}
                                    </div>
                                    <StatusBadge
                                      tone={INSTANCE_STATUS_TONE[inst.status] ?? "neutral"}
                                      className="shrink-0"
                                    >
                                      {inst.status}
                                    </StatusBadge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(versions ?? []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-line p-4 text-center text-[13.5px] text-ink-muted">
                    No versions for this template.
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center text-ink-muted">
              <Layers size={28} strokeWidth={1.6} className="mx-auto mb-2" aria-hidden />
              <p className="text-[13.5px]">Select a template to view version lineage and instances.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Dev Tools (collapsed) */}
      <div>
        <button
          type="button"
          onClick={() => setDevToolsOpen((o) => !o)}
          className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted hover:text-ink transition-colors duration-150"
        >
          {devToolsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Dev Tools
        </button>
        {devToolsOpen && (
          <Card className="mt-2 p-4">
            <p className="text-[12.5px] text-ink-secondary mb-3">
              Demo seeding and the instance/tenant backfills are deployment-wide
              operations that rewrite rows across every workspace — including
              reassigning records between company accounts. They are operator CLI
              commands, not browser actions.
            </p>
            <pre className="mb-3 overflow-x-auto rounded-md border border-line bg-surface-2 p-3 text-[11.5px] text-ink-secondary">
{`pnpm run convex:seed:demo:force
pnpm run migration:health
pnpm run migration:backfill:refs
pnpm run migration:backfill:tenant`}
            </pre>
          </Card>
        )}
      </div>
      </div>
    </section>
  );
}
