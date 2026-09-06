import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

type ExecutionEnvironment = "LOCAL" | "CLOUD" | "POLICY_SELECTED";

interface ScopeMapping {
  requestedCodeScope: string;
  codeScopeId: string;
}

type PreviewResult = FunctionReturnType<
  typeof api.factoryPackageImports.preview
>;
type ImportResult = FunctionReturnType<
  typeof api.factoryPackageImports.importDrafts
>;
type ImportError = Extract<PreviewResult, { ok: false }>["error"];
type PackagePreview = Extract<PreviewResult, { ok: true }>["preview"];
type ImportReceipt = Extract<ImportResult, { ok: true }>["receipt"];

function initialMappings(requestedCodeScopes: string[]): ScopeMapping[] {
  const scopes = [...new Set(requestedCodeScopes.map((scope) => scope.trim()))]
    .filter(Boolean)
    .slice(0, 50);
  return (scopes.length ? scopes : [""]).map((requestedCodeScope) => ({
    requestedCodeScope,
    codeScopeId: "",
  }));
}

function LabeledValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all text-xs text-ink-secondary">{value}</dd>
    </div>
  );
}

export function FactoryPackageImportDialog({
  projectId,
  open,
  onOpenChange,
  initialPackageId = "",
  initialPackageVersion = "1",
  initialRequestedCodeScopes = [],
  onImported,
}: {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPackageId?: string;
  initialPackageVersion?: string;
  initialRequestedCodeScopes?: string[];
  onImported?: (missionId: string) => void;
}) {
  const qualification = useQuery(
    api.factoryPackageImports.qualificationStatus,
    { projectId },
  );
  const qualifiedProjectArgs = qualification?.enabled ? { projectId } : "skip";
  const repositories = useQuery(
    api.projects.listRepositories,
    qualifiedProjectArgs,
  );
  const structure = useQuery(
    api.softwareFactoryControlPlane.listWorkspaceStructure,
    qualifiedProjectArgs,
  );
  const workflows = useQuery(
    api.workflows.list,
    qualification?.enabled ? { activeOnly: true } : "skip",
  );
  const previewPackage = useAction(api.factoryPackageImports.preview);
  const importDrafts = useAction(api.factoryPackageImports.importDrafts);

  const [packageId, setPackageId] = useState("");
  const [packageVersion, setPackageVersion] = useState("1");
  const [repositoryId, setRepositoryId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [executionEnvironment, setExecutionEnvironment] =
    useState<ExecutionEnvironment>("POLICY_SELECTED");
  const [scopeMappings, setScopeMappings] = useState<ScopeMapping[]>([
    { requestedCodeScope: "", codeScopeId: "" },
  ]);
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [receipt, setReceipt] = useState<ImportReceipt | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  const [pending, setPending] = useState<"preview" | "confirm" | null>(null);
  const [confirmedDraftOnly, setConfirmedDraftOnly] = useState(false);

  const codeScopes = useQuery(
    api.projects.listCodeScopes,
    qualification?.enabled && repositoryId
      ? { repositoryId: repositoryId as Id<"workspaceRepositories"> }
      : "skip",
  );

  const readyRepositories = useMemo(
    () =>
      (repositories ?? []).filter(
        (repository) =>
          repository.repositoryId && repository.status === "READY",
      ),
    [repositories],
  );
  const activeTeams = useMemo(
    () => (structure?.teams ?? []).filter((team) => team.status === "ACTIVE"),
    [structure],
  );
  const eligibleOwnerIds = useMemo(
    () =>
      new Set(
        (structure?.memberships ?? [])
          .filter(
            (membership) => membership.active && membership.teamId === teamId,
          )
          .map((membership) => String(membership.memberId)),
      ),
    [structure, teamId],
  );
  const eligibleOwners = useMemo(
    () =>
      (structure?.members ?? []).filter(
        (member) => member.active && eligibleOwnerIds.has(String(member._id)),
      ),
    [eligibleOwnerIds, structure],
  );
  const eligibleScopes = useMemo(
    () =>
      (codeScopes ?? []).filter(
        (scope) =>
          scope.active &&
          (!scope.owningTeamId || String(scope.owningTeamId) === teamId),
      ),
    [codeScopes, teamId],
  );
  const eligibleWorkflows = useMemo(
    () =>
      (workflows ?? []).filter(
        (workflow) =>
          workflow.active &&
          (!workflow.projectId ||
            String(workflow.projectId) === String(projectId)),
      ),
    [projectId, workflows],
  );

  useEffect(() => {
    if (!open) return;
    setPackageId(initialPackageId.trim());
    setPackageVersion(initialPackageVersion || "1");
    setScopeMappings(initialMappings(initialRequestedCodeScopes));
    setPreview(null);
    setReceipt(null);
    setError(null);
    setPending(null);
    setConfirmedDraftOnly(false);
  }, [
    initialPackageId,
    initialPackageVersion,
    initialRequestedCodeScopes,
    open,
  ]);

  useEffect(() => {
    if (!open || repositoryId || !readyRepositories.length) return;
    const repository =
      readyRepositories.find((candidate) => candidate.isDefault) ??
      readyRepositories[0];
    setRepositoryId(String(repository.repositoryId));
  }, [open, readyRepositories, repositoryId]);

  useEffect(() => {
    if (!open || teamId || !activeTeams.length) return;
    setTeamId(String(activeTeams[0]._id));
  }, [activeTeams, open, teamId]);

  useEffect(() => {
    if (!open || ownerId || !eligibleOwners.length) return;
    setOwnerId(String(eligibleOwners[0]._id));
  }, [eligibleOwners, open, ownerId]);

  useEffect(() => {
    if (!open || workflowId || !eligibleWorkflows.length) return;
    setWorkflowId(eligibleWorkflows[0].workflowId);
  }, [eligibleWorkflows, open, workflowId]);

  function invalidatePreview() {
    setPreview(null);
    setReceipt(null);
    setError(null);
    setConfirmedDraftOnly(false);
  }

  const numericPackageVersion = Number(packageVersion);
  const canPreview =
    qualification?.enabled === true &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      packageId,
    ) &&
    Number.isSafeInteger(numericPackageVersion) &&
    numericPackageVersion > 0 &&
    Boolean(repositoryId && teamId && ownerId && workflowId) &&
    scopeMappings.length > 0 &&
    scopeMappings.every(
      (mapping) => mapping.requestedCodeScope.trim() && mapping.codeScopeId,
    ) &&
    new Set(scopeMappings.map((mapping) => mapping.requestedCodeScope.trim()))
      .size === scopeMappings.length &&
    new Set(scopeMappings.map((mapping) => mapping.codeScopeId)).size ===
      scopeMappings.length;

  function actionTarget() {
    return {
      projectId,
      repositoryId: repositoryId as Id<"workspaceRepositories">,
      ownerMemberId: ownerId as Id<"orgMembers">,
      owningTeamId: teamId as Id<"scrumTeams">,
      codeScopeMappings: scopeMappings.map((mapping) => ({
        requestedCodeScope: mapping.requestedCodeScope.trim(),
        codeScopeId: mapping.codeScopeId as Id<"repositoryCodeScopes">,
      })),
      workflowId,
      executionEnvironment,
    };
  }

  async function runPreview() {
    if (!canPreview || pending) return;
    setPending("preview");
    setError(null);
    setPreview(null);
    setReceipt(null);
    setConfirmedDraftOnly(false);
    try {
      const result = await previewPackage({
        packageId: packageId.trim(),
        packageVersion: numericPackageVersion,
        ...actionTarget(),
      });
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      setPreview(result.preview);
    } catch {
      setError({
        code: "TEMPORARY_UNAVAILABLE",
        message:
          "Mission Control could not retrieve the Factory Engineer package. No draft was created.",
        correlationId: "Unavailable",
      });
    } finally {
      setPending(null);
    }
  }

  async function confirmImport() {
    if (
      !preview ||
      !preview.governance.canCreateDrafts ||
      !confirmedDraftOnly ||
      pending
    ) {
      return;
    }
    setPending("confirm");
    setError(null);
    try {
      const result = await importDrafts({
        packageId: packageId.trim(),
        packageVersion: numericPackageVersion,
        expectedPackageDigest: preview.packageDigest,
        expectedMappingDigest: preview.mappingDigest,
        ...actionTarget(),
      });
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      setReceipt(result.receipt);
    } catch {
      setError({
        code: "TEMPORARY_UNAVAILABLE",
        message:
          "Mission Control could not confirm the import. It is safe to retry with the same preview.",
        correlationId: preview.correlationId,
      });
    } finally {
      setPending(null);
    }
  }

  const loadingConfiguration =
    qualification === undefined ||
    (qualification.enabled &&
      (repositories === undefined ||
        structure === undefined ||
        workflows === undefined));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Factory Engineer draft</DialogTitle>
          <DialogDescription>
            Mission Control retrieves one immutable package through its
            server-held credential. Preview writes nothing; confirmation creates
            only an editable Mission and Plan draft.
          </DialogDescription>
        </DialogHeader>

        {loadingConfiguration ? (
          <div
            className="rounded-xl border border-line bg-surface-2 p-5 text-sm text-ink-secondary"
            role="status"
          >
            Checking qualification mode and authorized workspace options…
          </div>
        ) : qualification.enabled === false ? (
          <div
            className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-ink-secondary"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <div className="font-medium text-ink">
                Import is not enabled for this workspace
              </div>
              <p className="mt-1">
                The project-scoped qualification gate, server configuration, or
                your delivery permissions are not ready. No Factory Engineer
                request was made.
              </p>
            </div>
          </div>
        ) : receipt ? (
          <div className="space-y-4">
            <div
              className="flex gap-3 rounded-xl border border-success/30 bg-success/10 p-4"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <div className="font-medium text-ink">
                  {receipt.created
                    ? "Mission and Plan drafts created"
                    : "Existing draft import found"}
                </div>
                <p className="mt-1 text-sm text-ink-secondary">
                  Nothing was approved, dispatched, published, merged, released,
                  or deployed. The Mission remains in planning and the Plan
                  remains editable.
                </p>
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <LabeledValue label="Mission" value={receipt.missionId} />
              <LabeledValue label="Plan draft" value={receipt.missionPlanId} />
              <LabeledValue
                label="Package digest"
                value={receipt.packageDigest}
              />
              <LabeledValue
                label="Mapping digest"
                value={receipt.mappingDigest}
              />
            </dl>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  Immutable package reference
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Enter only the non-secret ID and version supplied by Factory
                  Engineer. Origin and credentials come from server
                  configuration.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5">
                  <Label htmlFor="factory-package-id">Package ID</Label>
                  <Input
                    id="factory-package-id"
                    autoComplete="off"
                    value={packageId}
                    onChange={(event) => {
                      setPackageId(event.target.value);
                      invalidatePreview();
                    }}
                    placeholder="00000000-0000-4000-8000-000000000000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="factory-package-version">Version</Label>
                  <Input
                    id="factory-package-version"
                    min="1"
                    step="1"
                    type="number"
                    value={packageVersion}
                    onChange={(event) => {
                      setPackageVersion(event.target.value);
                      invalidatePreview();
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  Authorized Mission Control target
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  These selections are reauthorized on preview and again in the
                  atomic confirmation transaction.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="factory-target-repository">Repository</Label>
                  <select
                    id="factory-target-repository"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={repositoryId}
                    onChange={(event) => {
                      setRepositoryId(event.target.value);
                      setScopeMappings((current) =>
                        current.map((mapping) => ({
                          ...mapping,
                          codeScopeId: "",
                        })),
                      );
                      invalidatePreview();
                    }}
                  >
                    <option value="">Select repository</option>
                    {readyRepositories.map((repository) => (
                      <option
                        key={String(repository.repositoryId)}
                        value={String(repository.repositoryId)}
                      >
                        {repository.displayName} ·{" "}
                        {repository.dataClassification}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="factory-target-team">Owning team</Label>
                  <select
                    id="factory-target-team"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={teamId}
                    onChange={(event) => {
                      setTeamId(event.target.value);
                      setOwnerId("");
                      setScopeMappings((current) =>
                        current.map((mapping) => ({
                          ...mapping,
                          codeScopeId: "",
                        })),
                      );
                      invalidatePreview();
                    }}
                  >
                    <option value="">Select team</option>
                    {activeTeams.map((team) => (
                      <option key={String(team._id)} value={String(team._id)}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="factory-target-owner">
                    Accountable owner
                  </Label>
                  <select
                    id="factory-target-owner"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                    disabled={!teamId}
                    value={ownerId}
                    onChange={(event) => {
                      setOwnerId(event.target.value);
                      invalidatePreview();
                    }}
                  >
                    <option value="">Select owner</option>
                    {eligibleOwners.map((owner) => (
                      <option key={String(owner._id)} value={String(owner._id)}>
                        {owner.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="factory-target-workflow">Workflow</Label>
                  <select
                    id="factory-target-workflow"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={workflowId}
                    onChange={(event) => {
                      setWorkflowId(event.target.value);
                      invalidatePreview();
                    }}
                  >
                    <option value="">Select workflow</option>
                    {eligibleWorkflows.map((workflow) => (
                      <option
                        key={workflow.workflowId}
                        value={workflow.workflowId}
                      >
                        {workflow.name} · v{workflow.version}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="factory-target-environment">
                    Environment policy
                  </Label>
                  <select
                    id="factory-target-environment"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={executionEnvironment}
                    onChange={(event) => {
                      setExecutionEnvironment(
                        event.target.value as ExecutionEnvironment,
                      );
                      invalidatePreview();
                    }}
                  >
                    <option value="POLICY_SELECTED">Policy selected</option>
                    <option value="LOCAL">Local</option>
                    <option value="CLOUD">Cloud</option>
                  </select>
                </div>
              </div>

              <fieldset className="space-y-3 rounded-lg border border-line p-3">
                <legend className="px-1 text-xs font-medium text-ink">
                  Exact code-scope mapping
                </legend>
                <p className="text-xs text-ink-muted">
                  Paste each requested scope exactly as Factory Engineer shows
                  it, then map it to one active local scope. Preview rejects
                  missing, duplicate, narrower, or broader mappings.
                </p>
                {scopeMappings.map((mapping, index) => (
                  <div
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    key={index}
                  >
                    <Input
                      aria-label={`Requested Factory Engineer scope ${index + 1}`}
                      autoComplete="off"
                      value={mapping.requestedCodeScope}
                      onChange={(event) => {
                        setScopeMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  requestedCodeScope: event.target.value,
                                }
                              : item,
                          ),
                        );
                        invalidatePreview();
                      }}
                      placeholder="apps/marketplace/**"
                    />
                    <select
                      aria-label={`Mission Control code scope ${index + 1}`}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={mapping.codeScopeId}
                      onChange={(event) => {
                        setScopeMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, codeScopeId: event.target.value }
                              : item,
                          ),
                        );
                        invalidatePreview();
                      }}
                    >
                      <option value="">Select local scope</option>
                      {eligibleScopes.map((scope) => (
                        <option
                          key={String(scope._id)}
                          value={String(scope._id)}
                        >
                          {scope.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={scopeMappings.length === 1}
                      onClick={() => {
                        setScopeMappings((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        );
                        invalidatePreview();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={scopeMappings.length >= 50}
                  onClick={() => {
                    setScopeMappings((current) => [
                      ...current,
                      { requestedCodeScope: "", codeScopeId: "" },
                    ]);
                    invalidatePreview();
                  }}
                >
                  Add scope mapping
                </Button>
              </fieldset>
            </section>

            {error ? (
              <div
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-4"
                role="alert"
              >
                <div className="font-medium text-destructive">
                  {error.code.replace(/_/g, " ")}
                </div>
                <p className="mt-1 text-sm text-ink-secondary">
                  {error.message}
                </p>
                <p className="mt-2 break-all font-mono text-[10px] text-ink-muted">
                  Correlation {error.correlationId}
                </p>
              </div>
            ) : null}

            {preview ? (
              <section className="space-y-4 rounded-xl border border-success/30 bg-success/5 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      Verified draft preview
                    </h3>
                    <p className="mt-1 text-xs text-ink-secondary">
                      Package and current attestation are PUBLISHED. This
                      preview is not Mission Control approval or execution
                      authority.
                    </p>
                  </div>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <LabeledValue label="Issuer" value={preview.issuerId} />
                  <LabeledValue
                    label="Package"
                    value={`${preview.packageId} · v${preview.packageVersion}`}
                  />
                  <LabeledValue label="Status" value={preview.currentStatus} />
                  <LabeledValue
                    label="Package digest"
                    value={preview.packageDigest}
                  />
                  <LabeledValue
                    label={`Mapping digest · revision ${preview.mappingRevision}`}
                    value={preview.mappingDigest}
                  />
                  <LabeledValue
                    label="Correlation"
                    value={preview.correlationId}
                  />
                  <LabeledValue
                    label="Requested repository"
                    value={preview.requestedTarget.repositoryRef}
                  />
                  <LabeledValue
                    label="Requested environment"
                    value={preview.requestedTarget.environmentClass}
                  />
                  <LabeledValue
                    label="Local workflow"
                    value={`${preview.localTarget.workflowId} · v${preview.localTarget.workflowVersion}`}
                  />
                </dl>
                <div className="rounded-lg border border-line bg-surface-1 p-3">
                  <div className="text-sm font-medium text-ink">
                    {preview.missionDraft.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                    {preview.missionDraft.objective}
                  </p>
                  <div className="mt-2 text-xs text-ink-muted">
                    {preview.planDraft.assertions.length} assertions ·{" "}
                    {preview.planDraft.workOrderBlueprints.length} draft
                    blueprints · zero WorkOrders
                  </div>
                </div>
                {preview.governance.blockers.length ? (
                  <div
                    className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-ink-secondary"
                    role="alert"
                  >
                    <div className="font-medium text-ink">
                      Draft creation is blocked
                    </div>
                    <ul className="mt-1 list-disc pl-4">
                      {preview.governance.blockers.map((blocker) => (
                        <li key={blocker}>{blocker.replace(/_/g, " ")}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {preview.warnings.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-ink-secondary">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <label className="flex items-start gap-2 rounded-lg border border-line bg-surface-1 p-3 text-xs text-ink-secondary">
                  <input
                    className="mt-0.5"
                    type="checkbox"
                    checked={confirmedDraftOnly}
                    onChange={(event) =>
                      setConfirmedDraftOnly(event.target.checked)
                    }
                  />
                  <span>
                    I understand confirmation creates only a Mission in planning
                    and an editable Plan draft—no approval, WorkOrder, Attempt,
                    dispatch, publication, pull request, merge, release, or
                    deployment.
                  </span>
                </label>
              </section>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {receipt ? "Close" : "Cancel"}
          </Button>
          {receipt ? (
            <Button
              type="button"
              onClick={() => onImported?.(receipt.missionId)}
            >
              Open Mission draft
            </Button>
          ) : qualification?.enabled ? (
            preview ? (
              <Button
                type="button"
                disabled={
                  !preview.governance.canCreateDrafts ||
                  !confirmedDraftOnly ||
                  pending !== null
                }
                onClick={() => void confirmImport()}
              >
                {pending === "confirm"
                  ? "Creating drafts…"
                  : "Create Mission + Plan drafts"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canPreview || pending !== null}
                onClick={() => void runPreview()}
              >
                {pending === "preview"
                  ? "Retrieving…"
                  : "Preview verified draft"}
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
