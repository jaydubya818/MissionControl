import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { CODE_SCOPE_APPROVAL_POLICIES } from "../../../../convex/lib/workspaceRepositories";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/factory/badges";
import { AlertTriangle, CheckCircle2, GitBranch, Github, Layers3, Plus, ShieldCheck } from "lucide-react";
import { FactoryConfigurationPanel } from "./FactoryConfigurationPanel";
import { GovernancePolicyPanel } from "./GovernancePolicyPanel";

interface WorkspaceRepositoriesPanelProps {
  project: Doc<"projects">;
}

type RepositoryRow = {
  repositoryId: Id<"workspaceRepositories"> | null;
  source: "LEGACY" | "CONNECTION";
  repository: string;
  displayName: string;
  defaultBranch: string;
  isDefault: boolean;
  status: "UNCONFIGURED" | "CONFIGURED" | "READY" | "DEGRADED" | "ERROR";
  validatedAt?: number;
  validationError?: string;
  webhookStatus: "MISSING" | "CONFIGURED" | "READY" | "ERROR";
  dataClassification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "UNCLASSIFIED";
  scopeCount: number;
};

function statusTone(status: RepositoryRow["status"]): "success" | "warning" | "error" | "neutral" {
  if (status === "READY") return "success";
  if (status === "DEGRADED") return "warning";
  if (status === "ERROR") return "error";
  return "neutral";
}

export function WorkspaceRepositoriesPanel({ project }: WorkspaceRepositoriesPanelProps) {
  const repositoryRows = useQuery(api.projects.listRepositories, {
    projectId: project._id,
  }) as RepositoryRow[] | undefined;
  const setDefaultRepository = useMutation(api.projects.setDefaultRepository);
  const backfillLegacyRepositories = useMutation(api.projects.backfillLegacyRepositories);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<Id<"workspaceRepositories"> | null>(null);
  const [addRepositoryOpen, setAddRepositoryOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!repositoryRows) return;
    const currentStillExists = repositoryRows.some(
      (row) => row.repositoryId === selectedRepositoryId
    );
    if (!currentStillExists) {
      setSelectedRepositoryId(
        repositoryRows.find((row) => row.isDefault)?.repositoryId ??
          repositoryRows.find((row) => row.repositoryId)?.repositoryId ??
          null
      );
    }
  }, [repositoryRows, selectedRepositoryId]);

  const selectedRepository = repositoryRows?.find(
    (row) => row.repositoryId === selectedRepositoryId
  );

  const makeDefault = async (repositoryId: Id<"workspaceRepositories">) => {
    setActionPending(true);
    setActionError("");
    try {
      const result = await setDefaultRepository({ repositoryId });
      if (!result.success) setActionError(result.error || "Default repository could not be changed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Default repository could not be changed.");
    } finally {
      setActionPending(false);
    }
  };

  const enableCodeScopes = async () => {
    setActionPending(true);
    setActionError("");
    try {
      const result = await backfillLegacyRepositories({ projectId: project._id });
      if (result.failed > 0) {
        setActionError("Repository preparation failed. Existing workspace behavior is unchanged.");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Repository preparation failed.");
    } finally {
      setActionPending(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-medium text-ink-secondary">Repository connections</div>
          <div className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Portable source boundaries for work, agents, runs, and evidence. Local checkout paths remain executor-specific.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddRepositoryOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add repository
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {repositoryRows === undefined ? (
          <div className="space-y-2" aria-label="Loading repository connections">
            <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
            <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
          </div>
        ) : repositoryRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-5">
            <div className="flex items-start gap-3">
              <Github size={16} className="mt-0.5 text-ink-muted" aria-hidden />
              <div>
                <div className="text-[13.5px] font-medium text-ink">No repository connected</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                  Add a repository before dispatching repository-backed work. Workspaces can contain multiple repositories.
                </div>
              </div>
            </div>
          </div>
        ) : (
          repositoryRows.map((row) => {
            const selected = row.repositoryId !== null && row.repositoryId === selectedRepositoryId;
            const dataClassification = row.dataClassification ?? "UNCLASSIFIED";
            return (
              <div
                key={row.repositoryId ?? `legacy-${row.repository}`}
                className={`rounded-xl border px-4 py-4 ${
                  selected ? "border-line-strong bg-surface-2" : "border-line bg-surface-1"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => row.repositoryId && setSelectedRepositoryId(row.repositoryId)}
                    disabled={!row.repositoryId}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Github size={14} className="text-ink-muted" aria-hidden />
                      <span className="font-mono text-[13px] font-medium text-ink">{row.repository}</span>
                      {row.isDefault ? <StatusBadge tone="success">Default</StatusBadge> : null}
                      <StatusBadge tone={statusTone(row.status)}>{row.status.toLowerCase()}</StatusBadge>
                      <StatusBadge tone={dataClassification === "UNCLASSIFIED" ? "warning" : "neutral"}>
                        {dataClassification.toLowerCase()}
                      </StatusBadge>
                      {row.source === "LEGACY" ? <StatusBadge tone="neutral">Compatibility</StatusBadge> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <GitBranch size={12} aria-hidden /> {row.defaultBranch}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Layers3 size={12} aria-hidden /> {row.scopeCount} code scope{row.scopeCount === 1 ? "" : "s"}
                      </span>
                      <span>Webhook {row.webhookStatus.toLowerCase()}</span>
                      {row.validatedAt ? <span>Validated {new Date(row.validatedAt).toLocaleString()}</span> : null}
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {row.repositoryId && !row.isDefault ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionPending}
                        onClick={() => makeDefault(row.repositoryId!)}
                      >
                        Make default
                      </Button>
                    ) : null}
                    {row.repositoryId ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRepositoryId(row.repositoryId);
                          setScopeOpen(true);
                        }}
                      >
                        <Layers3 className="h-3.5 w-3.5" /> Add code scope
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled={actionPending} onClick={enableCodeScopes}>
                        Prepare monorepo scopes
                      </Button>
                    )}
                  </div>
                </div>
                {row.validationError ? (
                  <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                    {row.validationError}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {actionError ? (
        <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {actionError}
        </div>
      ) : null}

      <GovernancePolicyPanel projectId={project._id} />

      {selectedRepository?.repositoryId ? (
        <>
          <RepositoryDataClassificationPanel key={selectedRepository.repositoryId} repository={selectedRepository} />
          <GitHubAppReadinessPanel repositoryId={selectedRepository.repositoryId} />
          <FactoryConfigurationPanel
            projectId={project._id}
            repositoryId={selectedRepository.repositoryId}
            repositoryDataClassification={selectedRepository.dataClassification ?? "UNCLASSIFIED"}
          />
          <CodeScopeList
            projectId={project._id}
            repositoryId={selectedRepository.repositoryId}
            repository={selectedRepository.repository}
            onAdd={() => setScopeOpen(true)}
          />
        </>
      ) : null}

      {addRepositoryOpen ? (
        <AddRepositoryDialog projectId={project._id} onClose={() => setAddRepositoryOpen(false)} />
      ) : null}
      {scopeOpen && selectedRepository?.repositoryId ? (
        <AddCodeScopeDialog
          projectId={project._id}
          repositoryId={selectedRepository.repositoryId}
          repository={selectedRepository.repository}
          onClose={() => setScopeOpen(false)}
        />
      ) : null}
    </Card>
  );
}

function RepositoryDataClassificationPanel({ repository }: { repository: RepositoryRow & { repositoryId: Id<"workspaceRepositories"> } }) {
  const setRepositoryDataClassification = useMutation(api.projects.setRepositoryDataClassification);
  const currentDataClassification = repository.dataClassification ?? "UNCLASSIFIED";
  const [dataClassification, setDataClassification] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED">(
    currentDataClassification === "UNCLASSIFIED" ? "INTERNAL" : currentDataClassification,
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDataClassification(currentDataClassification === "UNCLASSIFIED" ? "INTERNAL" : currentDataClassification);
  }, [currentDataClassification]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const result = await setRepositoryDataClassification({
        repositoryId: repository.repositoryId,
        dataClassification,
        reason: reason.trim(),
      });
      if (!result.success) {
        setError(result.error || "Repository classification could not be saved.");
        return;
      }
      setSaved(true);
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Repository classification could not be saved.");
    } finally {
      setPending(false);
    }
  };

  const sensitive = dataClassification !== "PUBLIC";
  return (
    <section className="mt-5 border-t border-line pt-5" aria-labelledby="repository-classification-title">
      <div>
        <div id="repository-classification-title" className="flex items-center gap-2 text-[12.5px] font-medium text-ink-secondary">
          <ShieldCheck size={14} aria-hidden /> Repository data boundary
        </div>
        <div className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          Unclassified and non-public repositories are sensitive. Remote execution requires provider-enforced egress evidence; approved local execution remains eligible.
        </div>
      </div>
      <form className="mt-3 grid gap-3 rounded-lg border border-line bg-surface-2 p-3 md:grid-cols-[minmax(180px,0.35fr)_1fr_auto] md:items-end" onSubmit={save}>
        <Field id="repository-data-classification" label="Repository data classification">
          <select
            id="repository-data-classification"
            value={dataClassification}
            onChange={(event) => { setDataClassification(event.target.value as typeof dataClassification); setSaved(false); }}
            className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[13px] text-ink outline-none focus:border-info-accent focus:ring-2 focus:ring-info-accent/25"
          >
            <option value="PUBLIC">Public</option>
            <option value="INTERNAL">Internal</option>
            <option value="CONFIDENTIAL">Confidential</option>
            <option value="RESTRICTED">Restricted</option>
          </select>
        </Field>
        <Field id="repository-classification-reason" label="Decision reason">
          <Input
            id="repository-classification-reason"
            value={reason}
            onChange={(event) => { setReason(event.target.value); setSaved(false); }}
            placeholder="Why this classification is appropriate"
          />
        </Field>
        <Button type="submit" size="sm" disabled={pending || !reason.trim()}>
          {pending ? "Saving…" : "Save classification"}
        </Button>
      </form>
      <div className={`mt-2 text-[11.5px] ${sensitive ? "text-warning" : "text-ink-muted"}`}>
        {sensitive
          ? "Remote Sandbox is denied until the selected profile proves provider-enforced egress at every admission boundary."
          : "Public repository work may use a qualified remote profile; WorkOrder data boundaries can still require provider-enforced egress."}
      </div>
      {error ? <ErrorNotice message={error} /> : null}
      {saved ? <div role="status" className="mt-2 text-[11.5px] text-success">Classification saved. Create a new Factory version before dispatch.</div> : null}
    </section>
  );
}

function GitHubAppReadinessPanel({
  repositoryId,
}: {
  repositoryId: Id<"workspaceRepositories">;
}) {
  const readiness = useQuery(api.githubAppConnections.getRepositoryReadiness, {
    repositoryId,
  });
  const deliveries = useQuery(api.githubAppConnections.listDeliveries, {
    repositoryId,
    limit: 50,
  });
  const visibleDeliveries = useMemo(() => {
    if (!deliveries) return deliveries;
    const selected = deliveries.slice(0, 8);
    for (const event of ["pull_request", "pull_request_review"]) {
      const representative = deliveries.find((delivery) => delivery.event === event);
      if (representative && !selected.some((delivery) => delivery._id === representative._id)) selected.push(representative);
    }
    return selected;
  }, [deliveries]);
  const beginInstallation = useAction(api.githubAppConnections.beginInstallation);
  const verifyInstallation = useAction(api.githubAppConnections.verifyInstallation);
  const bindExistingInstallation = useAction(api.githubAppConnections.bindExistingInstallation);
  const [installPending, setInstallPending] = useState(false);
  const [installError, setInstallError] = useState("");
  const [installationId, setInstallationId] = useState("");

  if (readiness === undefined) {
    return (
      <div className="mt-5 border-t border-line pt-5" aria-label="Loading GitHub App readiness">
        <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  }

  const tone = readiness.overall === "VERIFIED"
    ? "success" as const
    : readiness.overall === "STALE"
      ? "warning" as const
      : "error" as const;

  const install = async () => {
    setInstallPending(true);
    setInstallError("");
    try {
      if (readiness.installation) {
        const verification = await verifyInstallation({ repositoryId });
        if (!verification.ok) {
          setInstallError(
            "code" in verification && verification.code === "NOT_CONFIGURED"
              ? "GitHub App verification is not configured for this environment. Add the required server credentials, then try again."
              : "GitHub App verification failed. Confirm that this installation grants access to the exact repository, then try again."
          );
        }
        setInstallPending(false);
        return;
      }
      const result = await beginInstallation({ repositoryId });
      if (!result.ok) {
        setInstallError(
          "GitHub App setup is not configured for this environment. Add the required server credentials, then try again."
        );
        setInstallPending(false);
        return;
      }
      window.location.assign(result.installUrl);
    } catch (error) {
      setInstallError("GitHub App setup could not start. Try again or ask a workspace administrator.");
      setInstallPending(false);
    }
  };

  const bindExisting = async () => {
    setInstallPending(true);
    setInstallError("");
    try {
      const result = await bindExistingInstallation({ repositoryId, installationId: installationId.trim() });
      if (!result.ok) {
        setInstallError("code" in result && result.code === "NOT_CONFIGURED"
          ? "GitHub App verification is not configured for this environment. Add the App ID and private key, then try again."
          : "The installation could not be verified for this exact repository.");
      }
    } catch {
      setInstallError("The installation could not be verified for this exact repository.");
    } finally {
      setInstallPending(false);
    }
  };

  return (
    <section className="mt-5 border-t border-line pt-5" aria-labelledby="github-app-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div id="github-app-readiness-title" className="flex items-center gap-2 text-[12.5px] font-medium text-ink-secondary">
            <ShieldCheck size={14} aria-hidden /> GitHub App readiness
          </div>
          <div className="mt-1 text-[12px] text-ink-muted">
            Installation identity, least privilege, webhook coverage, and verification freshness.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={tone}>{readiness.overall.toLowerCase()}</StatusBadge>
          {readiness.overall !== "VERIFIED" ? (
            <Button variant="outline" size="sm" disabled={installPending} onClick={install}>
              <Github className="h-3.5 w-3.5" aria-hidden />
              {installPending
                ? readiness.installation ? "Verifying…" : "Opening GitHub…"
                : readiness.installation ? "Verify installation" : "Install GitHub App"}
            </Button>
          ) : null}
        </div>
      </div>

      {!readiness.installation ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-2 px-3 py-3">
          <label className="min-w-[220px] flex-1 text-[11.5px] text-ink-muted">
            Existing GitHub installation ID
            <Input className="mt-1" inputMode="numeric" value={installationId} onChange={(event) => setInstallationId(event.target.value)} placeholder="12345678" />
          </label>
          <Button type="button" variant="outline" size="sm" disabled={installPending || !/^\d+$/.test(installationId.trim())} onClick={bindExisting}>
            {installPending ? "Verifying…" : "Verify and bind installation"}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {readiness.checks.map((check) => {
          const passing = check.status === "VERIFIED";
          return (
            <div key={check.id} className="rounded-lg border border-line bg-surface-2 px-3 py-3">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                {passing ? (
                  <CheckCircle2 size={14} className="text-success" aria-hidden />
                ) : (
                  <AlertTriangle size={14} className="text-warning" aria-hidden />
                )}
                {check.label}
                <span className="sr-only">: {check.status}</span>
              </div>
              <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{check.detail}</div>
              {check.remediation ? (
                <div className="mt-2 text-[11.5px] leading-relaxed text-ink-secondary">
                  Next: {check.remediation}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {readiness.installation ? (
        <div className="mt-2 text-[11px] text-ink-muted">
          Installation {readiness.installation.installationId} · {readiness.installation.accountLogin} · tokens are not stored
        </div>
      ) : null}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12.5px] font-medium text-ink-secondary">Recent webhook deliveries</div>
            <div className="mt-1 text-[11.5px] text-ink-muted">Authenticated GitHub events for this exact repository connection.</div>
          </div>
          <StatusBadge tone={visibleDeliveries?.some((delivery) => delivery.status === "FAILED") ? "error" : "success"}>
            {visibleDeliveries === undefined ? "loading" : `${visibleDeliveries.length} shown`}
          </StatusBadge>
        </div>
        {deliveries === undefined ? (
          <div className="mt-3 h-16 animate-pulse rounded-lg bg-surface-2" aria-label="Loading recent webhook deliveries" />
        ) : visibleDeliveries!.length === 0 ? (
          <div className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-3 text-[12px] text-ink-muted">No webhook deliveries recorded for this repository yet.</div>
        ) : (
          <ul className="mt-3 space-y-2" aria-label="Recent webhook deliveries">
            {visibleDeliveries!.map((delivery) => {
              const passing = delivery.status === "PROCESSED" || delivery.status === "IGNORED";
              return (
                <li key={delivery._id} className="rounded-lg border border-line bg-surface-2 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[12.5px] font-medium text-ink">{delivery.event}{delivery.action ? ` · ${delivery.action}` : ""}</div>
                      <div className="mt-1 font-mono text-[10.5px] text-ink-muted">{delivery.deliveryId}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge tone={delivery.signatureStatus === "VALID" ? "success" : "error"}>signature {delivery.signatureStatus.toLowerCase()}</StatusBadge>
                      <StatusBadge tone={passing ? "success" : delivery.status === "FAILED" ? "error" : "warning"}>{delivery.status.toLowerCase()}</StatusBadge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-ink-muted">
                    <span>{delivery.result ?? delivery.error ?? "Processing result not recorded."}</span>
                    <time dateTime={new Date(delivery.receivedAt).toISOString()}>{new Date(delivery.receivedAt).toLocaleString()}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {installError ? <ErrorNotice message={installError} /> : null}
    </section>
  );
}

function CodeScopeList({
  projectId,
  repositoryId,
  repository,
  onAdd,
}: {
  projectId: Id<"projects">;
  repositoryId: Id<"workspaceRepositories">;
  repository: string;
  onAdd: () => void;
}) {
  const scopes = useQuery(api.projects.listCodeScopes, { repositoryId });
  const structure = useQuery(api.softwareFactoryControlPlane.listWorkspaceStructure, { projectId });
  const archiveScope = useMutation(api.projects.archiveRepositoryCodeScope);
  const activeScopes = scopes?.filter((scope) => scope.active);

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12.5px] font-medium text-ink-secondary">Monorepo code scopes</div>
          <div className="mt-1 text-[12px] text-ink-muted">Governed repository-relative boundaries for {repository}.</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onAdd}>Add scope</Button>
      </div>
      <div className="mt-3 space-y-2">
        {activeScopes === undefined ? (
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
        ) : activeScopes.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-secondary">
            No code scopes defined. That is valid for a single-purpose repository; add scopes when a monorepo needs explicit app, service, or package boundaries.
          </div>
        ) : (
          activeScopes.map((scope) => (
            <div key={scope._id} className="rounded-lg border border-line bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <Layers3 size={13} className="text-ink-muted" aria-hidden />
                    {scope.name}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {scope.includePaths.map((path) => (
                      <code key={path} className="rounded border border-line bg-surface-1 px-1.5 py-0.5 text-[10.5px] text-ink-secondary">
                        {path}
                      </code>
                    ))}
                  </div>
                  <div className="mt-2 text-[11.5px] text-ink-muted">
                    {scope.owningTeamId
                      ? `Owner: ${structure?.teams.find((team) => team._id === scope.owningTeamId)?.name ?? scope.owningTeam ?? "Assigned team"} · `
                      : scope.owningTeam ? `Legacy owner: ${scope.owningTeam} · ` : ""}
                    {scope.allowedEnvironments.join(" + ").toLowerCase()} execution
                    {scope.verificationPolicy ? ` · ${scope.verificationPolicy}` : ""}
                    {scope.approvalPolicy ? ` · ${scope.approvalPolicy}` : ""}
                    {scope.overlapPriority ? ` · overlap priority ${scope.overlapPriority}` : ""}
                  </div>
                  {scope.approvalPolicyDescription ? (
                    <div className="mt-1 text-[11.5px] text-ink-muted">
                      Approval guidance: {scope.approvalPolicyDescription}
                    </div>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => archiveScope({ scopeId: scope._id })}>
                  Archive
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddRepositoryDialog({
  projectId,
  onClose,
}: {
  projectId: Id<"projects">;
  onClose: () => void;
}) {
  const createRepository = useMutation(api.projects.createRepositoryConnection);
  const [repository, setRepository] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [makeDefault, setMakeDefault] = useState(false);
  const [dataClassification, setDataClassification] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED">("INTERNAL");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await createRepository({
        projectId,
        repository: repository.trim(),
        defaultBranch: defaultBranch.trim(),
        makeDefault,
        dataClassification,
      });
      if (!result.success) {
        setError(result.error || "Repository could not be connected.");
        return;
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Repository could not be connected.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add repository</DialogTitle>
            <DialogDescription>
              Connect another repository to this workspace without changing its current default unless you choose to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <Field id="new-repository" label="Repository">
              <Input id="new-repository" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" autoFocus />
            </Field>
            <Field id="new-repository-branch" label="Default branch">
              <Input id="new-repository-branch" value={defaultBranch} onChange={(event) => setDefaultBranch(event.target.value)} />
            </Field>
            <Field id="new-repository-classification" label="Data classification">
              <select
                id="new-repository-classification"
                value={dataClassification}
                onChange={(event) => setDataClassification(event.target.value as typeof dataClassification)}
                className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[13px] text-ink outline-none focus:border-info-accent focus:ring-2 focus:ring-info-accent/25"
              >
                <option value="PUBLIC">Public</option>
                <option value="INTERNAL">Internal</option>
                <option value="CONFIDENTIAL">Confidential</option>
                <option value="RESTRICTED">Restricted</option>
              </select>
              <div className="mt-1 text-[11.5px] text-ink-muted">Internal is the safe default. Non-public repositories cannot use guest-only remote egress.</div>
            </Field>
            <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-3 py-3 text-[12.5px] text-ink-secondary">
              <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} className="mt-0.5" />
              <span><strong className="text-ink">Make this the workspace default.</strong><br />New unscoped work will use this repository unless a WorkOrder selects another.</span>
            </label>
          </div>
          {error ? <ErrorNotice message={error} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Connecting…" : "Connect repository"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCodeScopeDialog({
  projectId,
  repositoryId,
  repository,
  onClose,
}: {
  projectId: Id<"projects">;
  repositoryId: Id<"workspaceRepositories">;
  repository: string;
  onClose: () => void;
}) {
  const createScope = useMutation(api.projects.createRepositoryCodeScope);
  const structure = useQuery(api.softwareFactoryControlPlane.listWorkspaceStructure, { projectId });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [includePaths, setIncludePaths] = useState("");
  const [excludePaths, setExcludePaths] = useState("");
  const [owningTeamId, setOwningTeamId] = useState<Id<"scrumTeams"> | "">("");
  const [requiredReviewers, setRequiredReviewers] = useState("");
  const [verificationPolicy, setVerificationPolicy] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState("");
  const [approvalPolicyDescription, setApprovalPolicyDescription] = useState("");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [overlapPriority, setOverlapPriority] = useState("");
  const [allowLocal, setAllowLocal] = useState(true);
  const [allowCloud, setAllowCloud] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const derivedSlug = useMemo(
    () => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    [name]
  );
  useEffect(() => {
    if (!slugEdited) setSlug(derivedSlug);
  }, [derivedSlug, slugEdited]);

  const splitList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const allowedEnvironments = [
      ...(allowLocal ? ["LOCAL" as const] : []),
      ...(allowCloud ? ["CLOUD" as const] : []),
    ];
    if (allowedEnvironments.length === 0) {
      setError("Allow at least one execution environment.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await createScope({
        repositoryId,
        name: name.trim(),
        slug: slug.trim(),
        includePaths: splitList(includePaths),
        excludePaths: splitList(excludePaths),
        owningTeamId: owningTeamId || undefined,
        requiredReviewers: splitList(requiredReviewers),
        allowedEnvironments,
        verificationPolicy: verificationPolicy.trim() || undefined,
        approvalPolicy: approvalPolicy.trim() || undefined,
        approvalPolicyDescription: approvalPolicyDescription.trim() || undefined,
        allowOverlap,
        overlapPriority: allowOverlap && overlapPriority ? Number(overlapPriority) : undefined,
      });
      if (!result.success) {
        setError(result.error || "Code scope could not be created.");
        return;
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Code scope could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add monorepo code scope</DialogTitle>
            <DialogDescription>
              Define repository-relative paths that agents may target in {repository}. Overlapping scopes are rejected until ownership is reviewed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5 md:grid-cols-2">
            <Field id="scope-name" label="Name">
              <Input id="scope-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Buyer portal" autoFocus />
            </Field>
            <Field id="scope-slug" label="Slug">
              <Input id="scope-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} placeholder="buyer-portal" />
            </Field>
            <Field id="scope-includes" label="Included paths" className="md:col-span-2">
              <Textarea id="scope-includes" value={includePaths} onChange={(event) => setIncludePaths(event.target.value)} rows={3} placeholder={"apps/buyer-portal\npackages/checkout-ui"} />
            </Field>
            <Field id="scope-excludes" label="Excluded paths" className="md:col-span-2">
              <Textarea id="scope-excludes" value={excludePaths} onChange={(event) => setExcludePaths(event.target.value)} rows={2} placeholder="apps/buyer-portal/generated" />
            </Field>
            <Field id="scope-team" label="Owning team">
              <select id="scope-team" value={owningTeamId} onChange={(event) => setOwningTeamId(event.target.value as Id<"scrumTeams"> | "")} className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[13px] text-ink outline-none focus:border-info-accent focus:ring-2 focus:ring-info-accent/25">
                <option value="">No owning team</option>
                {(structure?.teams ?? []).filter((team) => team.status === "ACTIVE").map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
              </select>
            </Field>
            <Field id="scope-reviewers" label="Required reviewers">
              <Input id="scope-reviewers" value={requiredReviewers} onChange={(event) => setRequiredReviewers(event.target.value)} placeholder="Platform, Security" />
            </Field>
            <Field id="scope-policy" label="Verification policy" className="md:col-span-2">
              <Input id="scope-policy" value={verificationPolicy} onChange={(event) => setVerificationPolicy(event.target.value)} placeholder="Unit + browser + independent review" />
            </Field>
            <Field id="scope-approval-gate" label="Approval gate">
              <select
                id="scope-approval-gate"
                value={approvalPolicy}
                onChange={(event) => setApprovalPolicy(event.target.value)}
                className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[13px] text-ink outline-none focus:border-info-accent focus:ring-2 focus:ring-info-accent/25"
              >
                <option value="">No additional gate</option>
                {CODE_SCOPE_APPROVAL_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>{policy.replace(/_/g, " ").toLowerCase()}</option>
                ))}
              </select>
            </Field>
            <Field id="scope-approval-guidance" label="Approval guidance">
              <Input
                id="scope-approval-guidance"
                value={approvalPolicyDescription}
                onChange={(event) => setApprovalPolicyDescription(event.target.value)}
                placeholder="What the approver must confirm"
              />
            </Field>
            <div className="md:col-span-2 rounded-lg border border-line bg-surface-2 px-4 py-3">
              <label className="flex items-start gap-2 text-[12.5px] text-ink-secondary">
                <input type="checkbox" checked={allowOverlap} onChange={(event) => setAllowOverlap(event.target.checked)} className="mt-0.5" />
                <span><strong className="font-medium text-ink">Allow an intentional path overlap</strong><br />Overlaps need deterministic priority and an approval policy.</span>
              </label>
              {allowOverlap ? (
                <div className="mt-3 grid gap-3 md:grid-cols-[140px_1fr]">
                  <Field id="scope-priority" label="Priority">
                    <Input id="scope-priority" type="number" min={1} value={overlapPriority} onChange={(event) => setOverlapPriority(event.target.value)} placeholder="1" />
                  </Field>
                  <div className="self-end text-[12px] text-ink-muted">
                    Select a controlled approval gate above before saving an overlapping scope.
                  </div>
                </div>
              ) : null}
            </div>
            <div className="md:col-span-2 rounded-lg border border-line bg-surface-2 px-4 py-3">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink"><ShieldCheck size={14} /> Allowed execution</div>
              <div className="mt-3 flex flex-wrap gap-5 text-[12.5px] text-ink-secondary">
                <label className="flex items-center gap-2"><input type="checkbox" checked={allowLocal} onChange={(event) => setAllowLocal(event.target.checked)} /> Local executors</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={allowCloud} onChange={(event) => setAllowCloud(event.target.checked)} /> Cloud executors</label>
              </div>
            </div>
          </div>
          {error ? <ErrorNotice message={error} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create code scope"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{message}</div>;
}
