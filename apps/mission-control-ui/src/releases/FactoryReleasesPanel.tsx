import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/factory/badges";
import { useToast } from "../Toast";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  factoryReleaseCounts,
  factoryReleaseNextAction,
  factoryReleaseTone,
  type FactoryReleaseState,
} from "./factoryReleaseModel";

const INPUT_CLASS = "mt-1.5 h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TEXTAREA_CLASS = "mt-1.5 w-full rounded-lg border border-line bg-surface-1 p-3 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function fmtTime(value?: number) {
  return value ? new Date(value).toLocaleString() : "—";
}

function shortSha(value?: string) {
  return value?.slice(0, 12) ?? "unknown";
}

function allowedOrigin(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "";
  const config = (metadata as Record<string, unknown>).releaseVerification;
  if (!config || typeof config !== "object") return "";
  const origins = (config as Record<string, unknown>).allowedOrigins;
  return Array.isArray(origins) && typeof origins[0] === "string" ? origins[0] : "";
}

type DialogState =
  | { kind: "approve"; releaseId: Id<"factoryReleases"> }
  | { kind: "deploy"; releaseId: Id<"factoryReleases"> }
  | { kind: "rollback"; releaseId: Id<"factoryReleases"> }
  | { kind: "configure"; releaseId: Id<"factoryReleases"> }
  | null;

export function FactoryReleasesPanel({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const rows = useQuery(api.factory.releases.listForProject, projectId ? { projectId } : "skip");
  const approveDeployment = useMutation(api.factory.releases.approveStagingDeployment);
  const recordDeployment = useMutation(api.factory.releases.recordStagingDeployment);
  const recordRollback = useMutation(api.factory.releases.recordRollback);
  const configureOrigin = useMutation(api.factory.releases.configureStagingVerification);
  const verifyDeployment = useAction(api.factory.releases.verifyStagingDeployment);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");
  const [origin, setOrigin] = useState("");
  const [provider, setProvider] = useState("");
  const [providerDeploymentId, setProviderDeploymentId] = useState("");
  const [deploymentUrl, setDeploymentUrl] = useState("");
  const [provenanceUrl, setProvenanceUrl] = useState("");
  const [smokeUrl, setSmokeUrl] = useState("");
  const [healthUrl, setHealthUrl] = useState("");
  const [restoredCommitSha, setRestoredCommitSha] = useState("");
  const [providerRollbackId, setProviderRollbackId] = useState("");
  const [rollbackEvidenceUrl, setRollbackEvidenceUrl] = useState("");

  const counts = useMemo(() => factoryReleaseCounts((rows ?? []) as Array<{ release: { state: FactoryReleaseState; deploymentApprovalStatus: "PENDING" | "APPROVED" } }>), [rows]);
  const selected = dialog ? rows?.find(({ release }) => release._id === dialog.releaseId) : undefined;

  function closeDialog() {
    setDialog(null);
    setRationale("");
    setOrigin("");
    setProvider("");
    setProviderDeploymentId("");
    setDeploymentUrl("");
    setProvenanceUrl("");
    setSmokeUrl("");
    setHealthUrl("");
    setRestoredCommitSha("");
    setProviderRollbackId("");
    setRollbackEvidenceUrl("");
  }

  function openDeploy(row: NonNullable<typeof rows>[number]) {
    const configuredOrigin = allowedOrigin(row.environment?.metadata);
    const base = configuredOrigin.replace(/\/$/, "");
    setProvider("");
    setDeploymentUrl(base ? `${base}/` : "");
    setProvenanceUrl(base ? `${base}/__mission-control/release.json` : "");
    setSmokeUrl(base ? `${base}/` : "");
    setHealthUrl(base ? `${base}/health` : "");
    setDialog({ kind: "deploy", releaseId: row.release._id });
  }

  async function approve() {
    if (!selected || rationale.trim().length < 8) {
      toast("Record why this exact staging deployment is safe.", true);
      return;
    }
    try {
      setBusy("approve");
      await approveDeployment({
        releaseId: selected.release._id,
        expectedMergeCommitSha: selected.release.mergeCommitSha,
        rationale: rationale.trim(),
      });
      toast("Exact merge commit approved for staging deployment.");
      closeDialog();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Deployment approval failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function configure() {
    if (!selected || !projectId || !origin.trim()) return;
    try {
      setBusy("configure");
      await configureOrigin({ projectId, environmentId: selected.release.environmentId, allowedOrigin: origin.trim() });
      toast("Staging verification origin configured.");
      closeDialog();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Origin configuration failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function deploy() {
    if (!selected) return;
    try {
      setBusy("deploy");
      await recordDeployment({
        releaseId: selected.release._id,
        commitSha: selected.release.mergeCommitSha,
        provider: provider.trim(),
        providerDeploymentId: providerDeploymentId.trim(),
        deploymentUrl: deploymentUrl.trim(),
        provenanceUrl: provenanceUrl.trim(),
        smokeUrl: smokeUrl.trim(),
        healthUrl: healthUrl.trim(),
        idempotencyKey: `ui-factory-release:deploy:${selected.release._id}:${providerDeploymentId.trim()}`,
      });
      toast("Staging deployment receipt recorded. Independent verification is now required.");
      closeDialog();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Deployment receipt failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function verify(releaseId: Id<"factoryReleases">) {
    try {
      setBusy(`verify:${releaseId}`);
      const result = await verifyDeployment({ releaseId }) as { verified?: boolean; reason?: string };
      if (result.verified) toast("Staging provenance, smoke, and health checks passed.");
      else toast(`Staging verification failed${result.reason ? `: ${result.reason}` : "."}`, true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Staging verification failed.", true);
    } finally {
      setBusy(null);
    }
  }

  async function rollback() {
    if (!selected || rationale.trim().length < 8) {
      toast("Record why rollback is required.", true);
      return;
    }
    try {
      setBusy("rollback");
      await recordRollback({
        releaseId: selected.release._id,
        restoredCommitSha: restoredCommitSha.trim(),
        providerRollbackId: providerRollbackId.trim(),
        evidenceUrl: rollbackEvidenceUrl.trim(),
        rationale: rationale.trim(),
        humanConfirmed: true,
        idempotencyKey: `ui-factory-release:rollback:${selected.release._id}:${providerRollbackId.trim()}`,
      });
      toast("Rollback evidence recorded. Corrective work is now required.");
      closeDialog();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Rollback recording failed.", true);
    } finally {
      setBusy(null);
    }
  }

  if (!projectId) {
    return <Card className="p-6 text-center text-[13px] text-ink-muted">Select a workspace to view governed releases.</Card>;
  }

  return (
    <section aria-labelledby="factory-releases-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="registry-kicker">V1 golden path · staging only</div>
          <h2 id="factory-releases-title" className="mt-1 text-[18px] font-semibold text-ink">Governed factory releases</h2>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-ink-muted">
            Track the exact GitHub merge through human deployment approval, provider receipt, independent staging proof, and rollback. Production rollout is disabled.
          </p>
        </div>
        <StatusBadge tone="info">MERGED → DEPLOYED → VERIFIED / ROLLED BACK</StatusBadge>
      </div>

      {rows === undefined ? (
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading governed releases…
        </Card>
      ) : rows.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <GitCommitHorizontal className="mx-auto h-5 w-5 text-ink-muted" />
          <div className="mt-3 text-[14px] font-medium text-ink">No merged factory releases</div>
          <p className="mt-1 text-[12.5px] text-ink-muted">A release appears only after GitHub reports an exact merged commit for a correlated WorkOrder and Attempt.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["In scope", counts.total],
              ["Approval needed", counts.awaitingApproval],
              ["Verify now", counts.awaitingVerification],
              ["Verified", counts.verified],
              ["Rolled back", counts.rolledBack],
            ].map(([label, value]) => (
              <Card key={label} className="p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</div>
                <div className="mt-2 font-mono text-xl font-semibold text-ink">{value}</div>
              </Card>
            ))}
          </div>

          <div className="space-y-3">
            {rows.map((row) => {
              const { release, workOrder, environment, evidence } = row;
              const configuredOrigin = allowedOrigin(environment?.metadata);
              const nextAction = factoryReleaseNextAction(release as Parameters<typeof factoryReleaseNextAction>[0]);
              const verificationFailed = release.state === "DEPLOYED" && Boolean(release.blockingIssue);
              return (
                <Card key={release._id} className={verificationFailed ? "border-err/40 p-4" : "p-4"}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={factoryReleaseTone(release.state as FactoryReleaseState)}>{release.state}</StatusBadge>
                        <StatusBadge tone={release.deploymentApprovalStatus === "APPROVED" ? "success" : "warning"}>
                          deploy approval {release.deploymentApprovalStatus.toLowerCase()}
                        </StatusBadge>
                        <span className="text-[11px] text-ink-muted">{environment?.name ?? "Unknown staging environment"}</span>
                      </div>
                      <h3 className="mt-2 text-[15px] font-semibold text-ink">{workOrder?.title ?? "Factory WorkOrder"}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-muted">
                        <span>head {shortSha(release.sourceHeadSha)}</span>
                        <span>merge {shortSha(release.mergeCommitSha)}</span>
                        {release.providerDeploymentId ? <span>deployment {release.providerDeploymentId}</span> : null}
                      </div>
                      <div className={verificationFailed ? "mt-3 rounded-lg border border-err/30 bg-err-soft p-3" : "mt-3 rounded-lg border border-line bg-surface-2 p-3"}>
                        <div className="flex items-start gap-2">
                          {verificationFailed ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-err" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-registry-accent" />}
                          <div>
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Next governed action</div>
                            <p className="mt-1 text-[12.5px] text-ink-secondary">{nextAction}</p>
                            {release.blockingIssue ? <p className="mt-1 text-[11.5px] text-err">{release.blockingIssue}</p> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[240px] flex-col items-stretch gap-2 xl:items-end">
                      <a href={release.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-end gap-1 text-[11.5px] text-info-accent hover:underline">
                        Pull request {release.prNumber ? `#${release.prNumber}` : "evidence"} <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-[10.5px] text-ink-muted">Merged {fmtTime(release.mergedAt)}</span>
                      <div className="mt-1 flex flex-wrap justify-end gap-2">
                        {!configuredOrigin && release.state === "MERGED" ? (
                          <Button size="sm" variant="outline" onClick={() => { setOrigin(""); setDialog({ kind: "configure", releaseId: release._id }); }}>Configure staging origin</Button>
                        ) : null}
                        {release.state === "MERGED" && release.deploymentApprovalStatus === "PENDING" ? (
                          <Button size="sm" onClick={() => setDialog({ kind: "approve", releaseId: release._id })}>Approve staging</Button>
                        ) : null}
                        {release.state === "MERGED" && release.deploymentApprovalStatus === "APPROVED" ? (
                          <Button size="sm" disabled={!configuredOrigin} onClick={() => openDeploy(row)}>Record deployment</Button>
                        ) : null}
                        {release.state === "DEPLOYED" ? (
                          <Button size="sm" disabled={busy === `verify:${release._id}`} onClick={() => void verify(release._id)}>
                            {busy === `verify:${release._id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                            Verify staging
                          </Button>
                        ) : null}
                        {["DEPLOYED", "VERIFIED"].includes(release.state) ? (
                          <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: "rollback", releaseId: release._id })}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Rollback
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-line pt-3">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Evidence ledger</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {evidence.slice(0, 6).map((item) => (
                        <div key={item._id} className="rounded-lg border border-line bg-surface-1 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold text-ink-secondary">{item.kind.replace(/_/g, " ")}</span>
                            <StatusBadge tone={item.status === "PASS" ? "success" : item.status === "FAIL" ? "error" : "neutral"}>{item.status}</StatusBadge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-muted">{item.summary}</p>
                          <div className="mt-1 font-mono text-[9.5px] text-ink-muted">{shortSha(item.subjectSha)} · {fmtTime(item.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={dialog?.kind === "approve"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve exact merge for staging?</DialogTitle>
            <DialogDescription>This authorizes only commit {shortSha(selected?.release.mergeCommitSha)} in the selected staging environment. It does not authorize production.</DialogDescription>
          </DialogHeader>
          <label className="text-[12.5px] font-medium text-ink-secondary">Approval rationale<textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} className={TEXTAREA_CLASS} placeholder="Why this exact staging deployment is safe" /></label>
          <DialogFooter><Button variant="outline" onClick={closeDialog}>Cancel</Button><Button disabled={busy === "approve"} onClick={() => void approve()}>Approve staging</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "configure"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Configure staging verification origin</DialogTitle><DialogDescription>Only same-origin HTTPS provenance, smoke, health, deployment, and rollback evidence will be accepted.</DialogDescription></DialogHeader>
          <label className="text-[12.5px] font-medium text-ink-secondary">Allowed origin<input value={origin} onChange={(event) => setOrigin(event.target.value)} className={INPUT_CLASS} placeholder="https://staging.example.com" /></label>
          <DialogFooter><Button variant="outline" onClick={closeDialog}>Cancel</Button><Button disabled={busy === "configure"} onClick={() => void configure()}>Save governed origin</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "deploy"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Record staging deployment receipt</DialogTitle><DialogDescription>Every URL must use the configured staging origin. Independent verification must still prove commit {shortSha(selected?.release.mergeCommitSha)}.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium text-ink-secondary">Provider<input value={provider} onChange={(event) => setProvider(event.target.value)} className={INPUT_CLASS} /></label>
            <label className="text-[12px] font-medium text-ink-secondary">Provider deployment ID<input value={providerDeploymentId} onChange={(event) => setProviderDeploymentId(event.target.value)} className={INPUT_CLASS} /></label>
          </div>
          {[
            ["Deployment URL", deploymentUrl, setDeploymentUrl],
            ["Provenance JSON URL", provenanceUrl, setProvenanceUrl],
            ["Smoke URL", smokeUrl, setSmokeUrl],
            ["Health URL", healthUrl, setHealthUrl],
          ].map(([label, value, setter]) => (
            <label key={label as string} className="block text-[12px] font-medium text-ink-secondary">{label as string}<input value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className={INPUT_CLASS} /></label>
          ))}
          <DialogFooter><Button variant="outline" onClick={closeDialog}>Cancel</Button><Button disabled={busy === "deploy"} onClick={() => void deploy()}>Record deployment</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "rollback"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Record staging rollback</DialogTitle><DialogDescription>This is an explicit human recovery decision. It blocks the WorkOrder until corrective work is opened.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium text-ink-secondary">Restored full commit SHA<input value={restoredCommitSha} onChange={(event) => setRestoredCommitSha(event.target.value)} className={INPUT_CLASS} /></label>
            <label className="text-[12px] font-medium text-ink-secondary">Provider rollback ID<input value={providerRollbackId} onChange={(event) => setProviderRollbackId(event.target.value)} className={INPUT_CLASS} /></label>
          </div>
          <label className="text-[12px] font-medium text-ink-secondary">Rollback evidence URL<input value={rollbackEvidenceUrl} onChange={(event) => setRollbackEvidenceUrl(event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-[12px] font-medium text-ink-secondary">Rollback rationale<textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} className={TEXTAREA_CLASS} /></label>
          <DialogFooter><Button variant="outline" onClick={closeDialog}>Cancel</Button><Button variant="destructive" disabled={busy === "rollback"} onClick={() => void rollback()}>Confirm rollback evidence</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
