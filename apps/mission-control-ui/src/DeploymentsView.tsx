/**
 * Deployments View — Environment Deployment Board
 *
 * One column per environment (dev, staging, prod). Each column shows the
 * currently ACTIVE deployment, version badge, Deploy and Rollback CTAs.
 */

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
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
import { FactoryReleasesPanel } from "./releases/FactoryReleasesPanel";

function fmtTime(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const SELECT_CLASS =
  "h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function releaseGateTone(status: "PASS" | "WARN" | "FAIL") {
  if (status === "PASS") return "success" as const;
  if (status === "WARN") return "warning" as const;
  return "error" as const;
}

export function DeploymentsView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<Id<"tenants"> | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"agentTemplates"> | null>(null);
  const [deployEnvId, setDeployEnvId] = useState<Id<"environments"> | null>(null);
  const [deployVersionId, setDeployVersionId] = useState<Id<"agentVersions"> | null>(null);
  const [rollbackDeploymentId, setRollbackDeploymentId] = useState<Id<"deployments"> | null>(null);
  const [releaseGateDeploymentId, setReleaseGateDeploymentId] = useState<Id<"deployments"> | null>(null);
  const [releaseGateStatus, setReleaseGateStatus] = useState<"PASS" | "WARN" | "FAIL">("PASS");
  const [releaseGateRationale, setReleaseGateRationale] = useState("");
  const [releaseGateEvidence, setReleaseGateEvidence] = useState("");
  const [releaseGateQcRunId, setReleaseGateQcRunId] = useState("");
  const [releaseGateContextEvalRunId, setReleaseGateContextEvalRunId] = useState("");
  const [githubCiDeploymentId, setGithubCiDeploymentId] = useState<Id<"deployments"> | null>(null);
  const [githubPullRequestUrl, setGithubPullRequestUrl] = useState("");

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
  const latestShadowGates = useQuery(
    api["governance/deployments"].listLatestShadowGates,
    deployments ? { deploymentIds: deployments.map((deployment) => deployment._id) } : "skip"
  );
  const shadowGateHistory = useQuery(
    api["governance/deployments"].listShadowGateHistory,
    deployments ? { deploymentIds: deployments.map((deployment) => deployment._id) } : "skip"
  );

  const createDeployment = useMutation(api["governance/deployments"].createDeployment);
  const activateDeployment = useMutation(api["governance/deployments"].activateDeployment);
  const rollbackDeployment = useMutation(api["governance/deployments"].rollbackDeployment);
  const recordShadowGate = useMutation(api["governance/deployments"].recordShadowGate);
  const ingestPullRequest = useAction(api.factory.prChecks.ingestPullRequest);

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

  const shadowGateByDeployment = useMemo(
    () => new Map<Id<"deployments">, Doc<"releaseGateEvaluations">>(
      ((latestShadowGates ?? []) as Doc<"releaseGateEvaluations">[]).map((gate) => [gate.deploymentId, gate])
    ),
    [latestShadowGates]
  );

  const shadowGateHistoryByDeployment = useMemo(() => {
    const history = new Map<Id<"deployments">, Doc<"releaseGateEvaluations">[]>();
    for (const gate of (shadowGateHistory ?? []) as Doc<"releaseGateEvaluations">[]) {
      const entries = history.get(gate.deploymentId) ?? [];
      entries.push(gate);
      history.set(gate.deploymentId, entries);
    }
    return history;
  }, [shadowGateHistory]);

  const shadowGateObservation = useMemo(() => {
    const gates = (shadowGateHistory ?? []) as Doc<"releaseGateEvaluations">[];
    const deploymentById = new Map<Id<"deployments">, Doc<"deployments">>(
      ((deployments ?? []) as Doc<"deployments">[]).map((deployment) => [deployment._id, deployment])
    );
    return {
      pass: gates.filter((gate) => gate.status === "PASS").length,
      warn: gates.filter((gate) => gate.status === "WARN").length,
      fail: gates.filter((gate) => gate.status === "FAIL").length,
      automated: gates.filter((gate) => gate.automationKey).length,
      pending: gates.filter((gate) => deploymentById.get(gate.deploymentId)?.status === "PENDING").length,
      activated: gates.filter((gate) => deploymentById.get(gate.deploymentId)?.status === "ACTIVE").length,
    };
  }, [deployments, shadowGateHistory]);

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
      toast("Deployment created as pending. Record release evidence before activation.");
      setDeployEnvId(null);
      setDeployVersionId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Deploy failed", true);
    }
  };

  const handleActivate = async (deploymentId: Id<"deployments">) => {
    try {
      await activateDeployment({ deploymentId });
      toast("Deployment activated. Any recorded shadow evidence is preserved in the audit trail.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Activation failed", true);
    }
  };

  const resetReleaseGateForm = () => {
    setReleaseGateDeploymentId(null);
    setReleaseGateStatus("PASS");
    setReleaseGateRationale("");
    setReleaseGateEvidence("");
    setReleaseGateQcRunId("");
    setReleaseGateContextEvalRunId("");
  };

  const handleRecordReleaseGate = async () => {
    if (!releaseGateDeploymentId) return;
    const evidenceRefs = releaseGateEvidence
      .split("\n")
      .map((reference) => reference.trim())
      .filter(Boolean);
    if (!releaseGateRationale.trim() || evidenceRefs.length === 0) {
      toast("Add a rationale and at least one evidence reference.", true);
      return;
    }
    try {
      await recordShadowGate({
        deploymentId: releaseGateDeploymentId,
        status: releaseGateStatus,
        rationale: releaseGateRationale,
        evidenceRefs,
        qcRunId: releaseGateQcRunId.trim() ? (releaseGateQcRunId.trim() as Id<"qcRuns">) : undefined,
        contextEvalRunId: releaseGateContextEvalRunId.trim()
          ? (releaseGateContextEvalRunId.trim() as Id<"contextEvalRuns">)
          : undefined,
      });
      toast("Shadow release decision recorded. Activation remains operator-controlled.");
      resetReleaseGateForm();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not record release evidence", true);
    }
  };

  const handleIngestGithubCi = async () => {
    if (!projectId || !githubCiDeploymentId || !githubPullRequestUrl.trim()) {
      toast("Enter a GitHub pull request URL.", true);
      return;
    }
    try {
      const result = await ingestPullRequest({
        prUrl: githubPullRequestUrl.trim(),
        projectId,
        releaseDeploymentId: githubCiDeploymentId,
      });
      toast(`GitHub CI ingested: ${result.ciStatus}. Shadow decision recorded.`);
      setGithubCiDeploymentId(null);
      setGithubPullRequestUrl("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not ingest GitHub CI", true);
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
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Deployments"
        description="Govern code releases through staging proof, then manage agent-version deployments separately."
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
      <FactoryReleasesPanel projectId={projectId} />

      <div className="border-t border-line pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Agent runtime deployments</div>
        <p className="mt-1 text-[12px] text-ink-muted">Legacy agent-template version promotion remains a separate lifecycle.</p>
      </div>

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

      {selectedTemplateId && shadowGateHistory && (
        <Card className="border-line bg-surface-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">Shadow release observation</div>
              <p className="mt-1 text-[12px] text-ink-muted">
                {shadowGateObservation.automated} automated decisions · {shadowGateObservation.pending} on pending deployments · {shadowGateObservation.activated} recorded after activation
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="success">{shadowGateObservation.pass} PASS</StatusBadge>
              <StatusBadge tone="warning">{shadowGateObservation.warn} WARN</StatusBadge>
              <StatusBadge tone="error">{shadowGateObservation.fail} FAIL</StatusBadge>
            </div>
          </div>
        </Card>
      )}

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
            const shadowGate = active ? shadowGateByDeployment.get(active._id) : null;
            const shadowGateHistoryForActive = active ? shadowGateHistoryByDeployment.get(active._id) ?? [] : [];

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
                      <div className="mt-3 border-t border-line pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                            Release evidence
                          </span>
                          {shadowGate ? (
                            <StatusBadge tone={releaseGateTone(shadowGate.status)}>
                              {shadowGate.status} · shadow
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">Not evaluated</StatusBadge>
                          )}
                        </div>
                        <p className="mt-1 text-[11.5px] leading-4 text-ink-muted">
                          {shadowGate
                            ? shadowGate.rationale
                            : "No QC or eval decision has been recorded for this deployment."}
                        </p>
                        {shadowGate && (
                          <p className="mt-1 text-[10.5px] text-ink-muted">
                            {shadowGate.evidenceRefs.length} evidence reference{shadowGate.evidenceRefs.length === 1 ? "" : "s"} · {fmtTime(shadowGate.createdAt)}
                          </p>
                        )}
                        {shadowGateHistoryForActive.length > 1 && (
                          <p className="mt-1 text-[10.5px] text-ink-muted">
                            {shadowGateHistoryForActive.length} recorded shadow decisions · latest {shadowGate?.automationKey ? "automated" : "operator-recorded"}
                          </p>
                        )}
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
                  <div className="mb-3 space-y-2">
                    {pendingList.map((pending) => {
                      const pendingVersion = versionMap.get(pending.targetVersionId);
                      const pendingGate = shadowGateByDeployment.get(pending._id);
                      const pendingGateHistory = shadowGateHistoryByDeployment.get(pending._id) ?? [];
                      return (
                        <div key={pending._id} className="rounded-lg border border-line bg-surface-1 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium text-ink">Pending v{pendingVersion?.version ?? "?"}</span>
                            {pendingGate ? (
                              <StatusBadge tone={releaseGateTone(pendingGate.status)}>{pendingGate.status} · shadow</StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral">Not evaluated</StatusBadge>
                            )}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReleaseGateDeploymentId(pending._id)}>
                              Record evidence
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGithubCiDeploymentId(pending._id)}>
                              Ingest GitHub CI
                            </Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => void handleActivate(pending._id)}>
                              Activate
                            </Button>
                          </div>
                          {pendingGateHistory.length > 0 && (
                            <p className="mt-2 text-[10.5px] text-ink-muted">
                              {pendingGateHistory.length} shadow decision{pendingGateHistory.length === 1 ? "" : "s"} · latest {pendingGate?.automationKey ? "automated" : "operator-recorded"}
                            </p>
                          )}
                        </div>
                      );
                    })}
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
              Select a version to create as a pending deployment. Record release evidence before activation.
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
            <Button onClick={handleDeploy} disabled={!deployVersionId}>Create pending deployment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!releaseGateDeploymentId} onOpenChange={(open) => !open && resetReleaseGateForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record release evidence</DialogTitle>
            <DialogDescription>
              This records an auditable shadow decision. It informs activation but does not block it yet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block text-[13px] font-medium text-ink-secondary">
              Decision
              <select value={releaseGateStatus} onChange={(e) => setReleaseGateStatus(e.target.value as "PASS" | "WARN" | "FAIL")} className={`mt-2 w-full ${SELECT_CLASS}`}>
                <option value="PASS">PASS — evidence supports release</option>
                <option value="WARN">WARN — release has known risk</option>
                <option value="FAIL">FAIL — evidence does not support release</option>
              </select>
            </label>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Rationale
              <textarea value={releaseGateRationale} onChange={(e) => setReleaseGateRationale(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-line bg-surface-1 p-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Why this release decision was made" />
            </label>
            <label className="block text-[13px] font-medium text-ink-secondary">
              Evidence references
              <textarea value={releaseGateEvidence} onChange={(e) => setReleaseGateEvidence(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-line bg-surface-1 p-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="One URL, run ID, or artifact path per line" />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-medium text-ink-secondary">QC run ID (optional)<input value={releaseGateQcRunId} onChange={(e) => setReleaseGateQcRunId(e.target.value)} className={`mt-1 w-full ${SELECT_CLASS}`} /></label>
              <label className="block text-[12px] font-medium text-ink-secondary">Context eval run ID (optional)<input value={releaseGateContextEvalRunId} onChange={(e) => setReleaseGateContextEvalRunId(e.target.value)} className={`mt-1 w-full ${SELECT_CLASS}`} /></label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetReleaseGateForm}>Cancel</Button>
            <Button onClick={() => void handleRecordReleaseGate()}>Record shadow decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!githubCiDeploymentId} onOpenChange={(open) => {
        if (!open) {
          setGithubCiDeploymentId(null);
          setGithubPullRequestUrl("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ingest GitHub CI evidence</DialogTitle>
            <DialogDescription>
              Fetch the PR’s check runs and write an automated shadow decision. CI never blocks activation in shadow mode.
            </DialogDescription>
          </DialogHeader>
          <label className="block py-2 text-[13px] font-medium text-ink-secondary">
            Pull request URL
            <input value={githubPullRequestUrl} onChange={(e) => setGithubPullRequestUrl(e.target.value)} className={`mt-2 w-full ${SELECT_CLASS}`} placeholder="https://github.com/owner/repo/pull/123" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGithubCiDeploymentId(null); setGithubPullRequestUrl(""); }}>Cancel</Button>
            <Button onClick={() => void handleIngestGithubCi()}>Ingest CI</Button>
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
    </section>
  );
}
