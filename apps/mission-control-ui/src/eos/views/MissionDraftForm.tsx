import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  draftsEqual,
  missionDraftPayload,
  missionToDraftValues,
  SOURCE_KINDS,
  validateMissionDraft,
  type MissionDraftErrors,
  type MissionDraftValues,
} from "../missionDraftModel";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="text-xs text-destructive">{message}</p> : null;
}

export function MissionDraftForm({
  mission,
  projectId,
  onDirtyChange,
}: {
  mission: any;
  projectId: Id<"projects">;
  onDirtyChange?: (dirty: boolean) => void;
}): JSX.Element {
  const updateDraft = useMutation(api.missions.updateDraft);
  const structure = useQuery(api.softwareFactoryControlPlane.listWorkspaceStructure, { projectId });
  const repositories = useQuery(api.projects.listRepositories, { projectId });
  const formId = useId();
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const saveKeyRef = useRef<string | null>(null);
  const initial = useMemo(() => missionToDraftValues(mission), [mission]);
  const appliedServerValues = useRef(initial);
  const [baseline, setBaseline] = useState<MissionDraftValues>(initial);
  const [values, setValues] = useState<MissionDraftValues>(initial);
  const [errors, setErrors] = useState<MissionDraftErrors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = !draftsEqual(values, baseline);
  const editable = mission.state === "DRAFT";
  const codeScopes = useQuery(
    api.projects.listCodeScopes,
    values.repositoryId
      ? { repositoryId: values.repositoryId as Id<"workspaceRepositories"> }
      : "skip",
  );
  const selectedTeamMemberIds = useMemo(
    () => new Set(
      (structure?.memberships ?? [])
        .filter((membership) => membership.active && membership.teamId === values.owningTeamId)
        .map((membership) => membership.memberId),
    ),
    [structure, values.owningTeamId],
  );
  const eligibleOwners = (structure?.members ?? []).filter(
    (member) => member.active && selectedTeamMemberIds.has(member._id),
  );

  useEffect(() => {
    if (!dirty && !draftsEqual(initial, appliedServerValues.current)) {
      // Keep the mutation's confirmed values until the query publishes a new snapshot.
      appliedServerValues.current = initial;
      setBaseline(initial);
      setValues(initial);
    }
  }, [dirty, initial]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setField = <K extends keyof MissionDraftValues>(
    field: K,
    value: MissionDraftValues[K]
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus("idle");
    setSaveError(null);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || status === "saving") return;
    const nextErrors = validateMissionDraft(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setStatus("error");
      requestAnimationFrame(() => {
        const firstField = Object.keys(nextErrors)[0];
        document.getElementById(`${formId}-${firstField}`)?.focus();
      });
      return;
    }

    setStatus("saving");
    setSaveError(null);
    saveKeyRef.current ??= `ui-mission-draft:${crypto.randomUUID()}`;
    try {
      const payload = missionDraftPayload(values);
      const result = await updateDraft({
        missionId: mission._id,
        projectId,
        idempotencyKey: saveKeyRef.current,
        ...payload,
        ownerMemberId: payload.ownerMemberId as Id<"orgMembers">,
        owningTeamId: payload.owningTeamId as Id<"scrumTeams">,
        repositoryId: payload.repositoryId as Id<"workspaceRepositories">,
        codeScopeIds: payload.codeScopeIds as Array<Id<"repositoryCodeScopes">>,
      });
      const persisted = missionToDraftValues(result.mission);
      setValues(persisted);
      setBaseline(persisted);
      setStatus("saved");
      saveKeyRef.current = null;
      requestAnimationFrame(() => saveButtonRef.current?.focus());
    } catch (cause: any) {
      setSaveError(cause.message ?? "Mission draft could not be saved.");
      setStatus("error");
    }
  }

  if (!editable) {
    return (
      <section className="rounded-xl border border-line bg-surface-1 p-4">
        <h2 className="text-[13px] font-semibold text-ink">Draft details</h2>
        <p className="mt-2 text-[13px] text-ink-secondary">
          Draft editing is locked because this Mission is {mission.state.replace(/_/g, " ").toLowerCase()}.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6" aria-label="Mission draft">
      <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Draft definition</h2>
          <p className="mt-1 text-[12px] text-ink-muted">Define the governed outcome before planning begins.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-executionEnvironment`}>Execution environment</Label>
          <select
            id={`${formId}-executionEnvironment`}
            value={values.executionEnvironment ?? ""}
            disabled={status === "saving"}
            onChange={(event) => setField("executionEnvironment", event.target.value as MissionDraftValues["executionEnvironment"])}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="" disabled>Choose execution environment</option>
            <option value="LOCAL">Local</option>
            <option value="CLOUD">Cloud</option>
            <option value="REMOTE">Remote</option>
            <option value="POLICY_SELECTED">Choose by policy</option>
          </select>
          <p className="text-xs text-ink-muted">Execution still requires an approved Plan and qualified host.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-title`}>Title</Label>
          <Input id={`${formId}-title`} value={values.title} onChange={(event) => setField("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${formId}-title-error` : undefined} />
          <FieldError id={`${formId}-title-error`} message={errors.title} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-objective`}>Objective</Label>
          <Textarea id={`${formId}-objective`} value={values.objective} onChange={(event) => setField("objective", event.target.value)} aria-invalid={Boolean(errors.objective)} aria-describedby={errors.objective ? `${formId}-objective-error` : undefined} />
          <FieldError id={`${formId}-objective-error`} message={errors.objective} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-context`}>Context</Label>
          <Textarea id={`${formId}-context`} value={values.context} onChange={(event) => setField("context", event.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-owningTeamId`}>Owning team</Label>
            <select
              id={`${formId}-owningTeamId`}
              value={values.owningTeamId}
              onChange={(event) => {
                const teamId = event.target.value;
                setField("owningTeamId", teamId);
                const remainsEligible = (structure?.memberships ?? []).some(
                  (membership) => membership.active && membership.teamId === teamId && membership.memberId === values.ownerMemberId,
                );
                if (!remainsEligible) {
                  setField("ownerMemberId", "");
                  setField("owner", "");
                }
              }}
              aria-invalid={Boolean(errors.owningTeamId)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select team</option>
              {(structure?.teams ?? []).filter((team) => team.status === "ACTIVE").map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
            </select>
            <FieldError id={`${formId}-owningTeamId-error`} message={errors.owningTeamId} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-ownerMemberId`}>Accountable owner</Label>
            <select
              id={`${formId}-ownerMemberId`}
              value={values.ownerMemberId}
              onChange={(event) => {
                const memberId = event.target.value;
                setField("ownerMemberId", memberId);
                setField("owner", eligibleOwners.find((member) => member._id === memberId)?.name ?? "");
              }}
              disabled={!values.owningTeamId}
              aria-invalid={Boolean(errors.ownerMemberId)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">{values.owningTeamId ? "Select owner" : "Select a team first"}</option>
              {eligibleOwners.map((member) => <option key={member._id} value={member._id}>{member.name}</option>)}
            </select>
            <FieldError id={`${formId}-ownerMemberId-error`} message={errors.ownerMemberId} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-repositoryId`}>Repository</Label>
            <select
              id={`${formId}-repositoryId`}
              value={values.repositoryId}
              onChange={(event) => {
                setField("repositoryId", event.target.value);
                setField("codeScopeIds", []);
              }}
              aria-invalid={Boolean(errors.repositoryId)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select repository</option>
              {(repositories ?? []).filter((repository) => repository.repositoryId && repository.status === "READY").map((repository) => (
                <option key={repository.repositoryId!} value={repository.repositoryId!}>{repository.displayName}</option>
              ))}
            </select>
            <FieldError id={`${formId}-repositoryId-error`} message={errors.repositoryId} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-codeScopeIds`}>Code scope</Label>
            <select
              id={`${formId}-codeScopeIds`}
              value={values.codeScopeIds[0] ?? ""}
              onChange={(event) => setField("codeScopeIds", event.target.value ? [event.target.value] : [])}
              disabled={!values.repositoryId}
              aria-invalid={Boolean(errors.codeScopeIds)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">{values.repositoryId ? "Select scope" : "Select a repository first"}</option>
              {(codeScopes ?? []).filter((scope) => scope.active).map((scope) => <option key={scope._id} value={scope._id}>{scope.name}</option>)}
            </select>
            <FieldError id={`${formId}-codeScopeIds-error`} message={errors.codeScopeIds} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-ink">Constraints</h2>
            <p className="mt-1 text-[12px] text-ink-muted">Boundaries the plan must respect.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setField("constraints", [...values.constraints, ""])}>Add constraint</Button>
        </div>
        {values.constraints.map((constraint, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Label className="sr-only" htmlFor={`${formId}-constraints-${index}`}>Constraint {index + 1}</Label>
              <Input id={`${formId}-constraints-${index}`} value={constraint} onChange={(event) => {
                const next = [...values.constraints];
                next[index] = event.target.value;
                setField("constraints", next);
              }} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setField("constraints", values.constraints.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
          </div>
        ))}
        <FieldError id={`${formId}-constraints-error`} message={errors.constraints} />
      </section>

      <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-ink">Sources of truth</h2>
            <p className="mt-1 text-[12px] text-ink-muted">Repository, document, issue, or URL references used during planning.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setField("sourceOfTruthRefs", [...values.sourceOfTruthRefs, { kind: "DOC", label: "", location: "" }])}>Add source</Button>
        </div>
        {values.sourceOfTruthRefs.map((source, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[120px_1fr_1.4fr_auto]">
            <div>
              <Label className="sr-only" htmlFor={`${formId}-source-kind-${index}`}>Source {index + 1} kind</Label>
              <select id={`${formId}-source-kind-${index}`} value={source.kind} onChange={(event) => {
                const next = [...values.sourceOfTruthRefs];
                next[index] = { ...source, kind: event.target.value as typeof source.kind };
                setField("sourceOfTruthRefs", next);
              }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {SOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </div>
            <div>
              <Label className="sr-only" htmlFor={`${formId}-source-label-${index}`}>Source {index + 1} label</Label>
              <Input id={`${formId}-source-label-${index}`} value={source.label} placeholder="Label" onChange={(event) => {
                const next = [...values.sourceOfTruthRefs];
                next[index] = { ...source, label: event.target.value };
                setField("sourceOfTruthRefs", next);
              }} />
            </div>
            <div>
              <Label className="sr-only" htmlFor={`${formId}-source-location-${index}`}>Source {index + 1} location</Label>
              <Input id={`${formId}-source-location-${index}`} value={source.location} placeholder="Path or URL" onChange={(event) => {
                const next = [...values.sourceOfTruthRefs];
                next[index] = { ...source, location: event.target.value };
                setField("sourceOfTruthRefs", next);
              }} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setField("sourceOfTruthRefs", values.sourceOfTruthRefs.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
          </div>
        ))}
        <FieldError id={`${formId}-sourceOfTruthRefs-error`} message={errors.sourceOfTruthRefs} />
      </section>

      <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
        <h2 className="text-[13px] font-semibold text-ink">Guardrails</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-budgetUsd`}>Budget (USD)</Label>
            <Input id={`${formId}-budgetUsd`} type="number" min="0" step="0.01" value={values.budgetUsd} onChange={(event) => setField("budgetUsd", event.target.value)} aria-invalid={Boolean(errors.budgetUsd)} aria-describedby={errors.budgetUsd ? `${formId}-budgetUsd-error` : undefined} />
            <FieldError id={`${formId}-budgetUsd-error`} message={errors.budgetUsd} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-maxReadOnlyConcurrency`}>Read-only concurrency</Label>
            <Input id={`${formId}-maxReadOnlyConcurrency`} type="number" min="1" step="1" value={values.maxReadOnlyConcurrency} onChange={(event) => setField("maxReadOnlyConcurrency", event.target.value)} aria-invalid={Boolean(errors.maxReadOnlyConcurrency)} aria-describedby={errors.maxReadOnlyConcurrency ? `${formId}-maxReadOnlyConcurrency-error` : undefined} />
            <FieldError id={`${formId}-maxReadOnlyConcurrency-error`} message={errors.maxReadOnlyConcurrency} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-maxCorrectiveIterations`}>Corrective iterations</Label>
            <Input id={`${formId}-maxCorrectiveIterations`} type="number" min="0" step="1" value={values.maxCorrectiveIterations} onChange={(event) => setField("maxCorrectiveIterations", event.target.value)} aria-invalid={Boolean(errors.maxCorrectiveIterations)} aria-describedby={errors.maxCorrectiveIterations ? `${formId}-maxCorrectiveIterations-error` : undefined} />
            <FieldError id={`${formId}-maxCorrectiveIterations-error`} message={errors.maxCorrectiveIterations} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-stopCondition`}>Stop condition</Label>
          <Textarea id={`${formId}-stopCondition`} value={values.stopCondition} onChange={(event) => setField("stopCondition", event.target.value)} aria-invalid={Boolean(errors.stopCondition)} aria-describedby={errors.stopCondition ? `${formId}-stopCondition-error` : undefined} />
          <FieldError id={`${formId}-stopCondition-error`} message={errors.stopCondition} />
        </div>
      </section>

      <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-line bg-app/95 py-3 backdrop-blur">
        <div role="status" aria-live="polite" className="text-[12.5px] text-ink-secondary">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : dirty ? "Unsaved changes" : "No unsaved changes"}
          {saveError ? <span className="ml-2 text-destructive">— {saveError}</span> : null}
        </div>
        <Button ref={saveButtonRef} type="submit" disabled={!dirty || status === "saving"}>
          {status === "saving" ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
