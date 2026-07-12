/**
 * Deployments View — Environment Deployment Board
 *
 * One column per environment (dev, staging, prod). Each column shows the
 * currently ACTIVE deployment, version badge, Deploy and Rollback CTAs.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/factory/badges";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "./Toast";
import { Rocket, RotateCcw, Server } from "lucide-react";

function fmtTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DeploymentsView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [deployEnvId, setDeployEnvId] = useState<Id<"environments"> | null>(null);
  const [deployVersionId, setDeployVersionId] = useState<Id<"agentVersions"> | null>(null);
  const [rollbackDeploymentId, setRollbackDeploymentId] = useState<Id<"deployments"> | null>(null);

  const tenants = useQuery(api["registry/tenants"].listTenants, { activeOnly: false });
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
    if (!selectedTenantId && tenants?.length) setSelectedTenantId(tenants[0]._id);
  }, [selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTemplateId && templates?.length) setSelectedTemplateId(templates[0]._id);
  }, [selectedTemplateId, templates]);

  const versionMap = useMemo(() => {
    const map = new Map<Id<"agentVersions">, { version: number; status: string }>();
    for (const v of versions ?? []) map.set(v._id, { version: v.version, status: v.status });
    return map;
  }, [versions]);

  const activeByEnv = useMemo(() => {
    const map = new Map<Id<"environments">, typeof deployments[0]>();
    for (const d of deployments ?? []) {
      if (d.status === "ACTIVE") map.set(d.environmentId, d);
    }
    return map;
  }, [deployments]);

  const pendingByEnv = useMemo(() => {
    const map = new Map<Id<"environments">, (typeof deployments)[0][]>();
    for (const d of deployments ?? []) {
      if (d.status === "PENDING") {
        const list = map.get(d.environmentId) ?? [];
        list.push(d);
        map.set(d.environmentId, list);
      }
    }
    return map;
  }, [deployments]);

  const handleDeploy = async () => {
    if (!selectedTemplateId || !deployEnvId || !deployVersionId) {
      toast("Select environment and version.", true);
      return;
    }
    try {
      const active = activeByEnv.get(deployEnvId);
      const dep = await createDeployment({
        tenantId: selectedTenantId ?? undefined,
        templateId: selectedTemplateId,
        environmentId: deployEnvId,
        targetVersionId: deployVersionId,
        previousVersionId: active?.targetVersionId ?? undefined,
        metadata: { source: "deployments.ui" },
      });
      await activateDeployment({ deploymentId: dep._id });
      toast("Deployed and activated.");
      setDeployEnvId(null);
      setDeployVersionId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Deploy failed", true);
    }
  };

  const handleRollback = async () => {
    if (!rollbackDeploymentId) return;
    try {
      await rollbackDeployment({ deploymentId: rollbackDeploymentId });
      toast("Rollback created.");
      setRollbackDeploymentId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rollback failed", true);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Deployments"
        description="Promote approved versions through environments. Activate and rollback from the board."
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">Tenant</span>
        <select
          value={selectedTenantId ?? ""}
          onChange={(e) => setSelectedTenantId((e.target.value || null) as Id<"tenants"> | null)}
          className={SELECT_CLASS}
        >
          <option value="">Select tenant</option>
          {(tenants ?? []).map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
        <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted ml-2">Template</span>
        <select
          value={selectedTemplateId ?? ""}
          onChange={(e) => setSelectedTemplateId((e.target.value || null) as Id<"agentTemplates"> | null)}
          className={SELECT_CLASS}
        >
          <option value="">Select template</option>
          {(templates ?? []).map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
      </div>

      {!selectedTemplateId ? (
        <div className="text-center py-12 text-ink-muted text-[13.5px]">
          Select a tenant and template to view the deployment board.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(environments ?? []).map((env) => {
            const active = activeByEnv.get(env._id);
            const pendingList = pendingByEnv.get(env._id) ?? [];
            const targetVersion = active ? versionMap.get(active.targetVersionId) : null;
            const previousVersion = active?.previousVersionId ? versionMap.get(active.previousVersionId) : null;

            return (
              <Card key={env._id} className="p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <Server size={15} strokeWidth={1.7} className="text-ink-muted" aria-hidden />
                  <span className="font-semibold text-ink text-[15px]">{env.name}</span>
                  <span className="text-[11.5px] text-ink-muted">({env.type})</span>
                </div>

                {active ? (
                  <>
                    <div className="rounded-lg border border-line bg-surface-2 p-3 mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[18px] font-semibold font-mono text-ink">v{targetVersion?.version ?? "?"}</span>
                        <StatusBadge tone="success">ACTIVE</StatusBadge>
                      </div>
                      {previousVersion && (
                        <div className="text-[11.5px] text-ink-muted font-mono">was v{previousVersion.version}</div>
                      )}
                      <div className="text-[11.5px] text-ink-muted mt-1">
                        Activated {fmtTime(active.activatedAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!active.previousVersionId}
                      onClick={() => setRollbackDeploymentId(active._id)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Rollback
                    </Button>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-line p-3 mb-3 text-center text-[13.5px] text-ink-muted">
                    No active deployment
                  </div>
                )}

                {pendingList.length > 0 && (
                  <div className="text-[11.5px] text-ink-muted mb-2">
                    {pendingList.length} pending
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs mt-auto"
                  onClick={() => setDeployEnvId(env._id)}
                >
                  <Rocket className="h-3 w-3 mr-1" />
                  Deploy
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {(environments ?? []).length === 0 && selectedTenantId && (
        <div className="text-center py-12 text-ink-muted text-[13.5px]">
          No environments for this tenant.
        </div>
      )}
      </div>

      {/* Deploy modal */}
      <Dialog open={!!deployEnvId} onOpenChange={(open) => !open && setDeployEnvId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy version</DialogTitle>
            <DialogDescription>
              Select a version to deploy to this environment. It will be activated immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-[13px] font-medium text-ink-secondary mb-2">Version</label>
            <select
              value={deployVersionId ?? ""}
              onChange={(e) => setDeployVersionId((e.target.value || null) as Id<"agentVersions"> | null)}
              className={`w-full ${SELECT_CLASS}`}
            >
              <option value="">Select version</option>
              {(versions ?? []).map((v) => (
                <option key={v._id} value={v._id}>v{v.version} ({v.status})</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployEnvId(null)}>Cancel</Button>
            <Button onClick={handleDeploy} disabled={!deployVersionId}>Deploy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback confirmation */}
      <Dialog open={!!rollbackDeploymentId} onOpenChange={(open) => !open && setRollbackDeploymentId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rollback deployment?</DialogTitle>
            <DialogDescription>
              This will create a rollback to the previous version. The current deployment will be retired.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackDeploymentId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRollback}>Rollback</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
