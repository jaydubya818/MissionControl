import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Clock3,
  History,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  ACCESS_PERMISSION_DETAILS,
  ACCESS_PROFILE_DEFAULTS,
  ACCESS_VIEW_REQUIREMENTS,
  ADMIN_LOCKED_PERMISSIONS,
  ALL_ACCESS_PERMISSIONS,
  PERSONA_KEYS,
  PERSONA_SCOPE_LENSES,
  SCOPE_LENSES,
  SUPPORTED_ACCESS_VIEWS,
  type AccessControlMode,
  type AccessPermission,
  type AccessPermissionGroup,
  type AccessViewKey,
  type PersonaKey,
  type ScopeLens,
} from "@mission-control/shared";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/factory/badges";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ProfileSummary = {
  roleId: Id<"roles">;
  systemKey: PersonaKey;
  name: string;
  description: string;
  version: number;
  permissions: string[];
  visibleViews: string[];
  defaultLandingView: string;
  defaultScopeLens: ScopeLens;
  updatedAt?: number;
  assignments: { total: number; active: number };
};

type ProfileDraft = {
  permissions: AccessPermission[];
  visibleViews: AccessViewKey[];
  defaultLandingView: AccessViewKey;
  defaultScopeLens: ScopeLens;
};

type CoverageStatus = "UNINVENTORIED" | "INVENTORIED" | "SHADOW_ENFORCED" | "ENFORCED" | "BROWSER_PROVEN";

const GROUP_ORDER: AccessPermissionGroup[] = ["READ", "BUILD_OPERATE", "GOVERN_APPROVE", "ADMIN"];
const GROUP_LABELS: Record<AccessPermissionGroup, string> = {
  READ: "Read and inspect",
  BUILD_OPERATE: "Build and operate",
  GOVERN_APPROVE: "Govern and approve",
  ADMIN: "Administration",
};

function labelForView(view: string) {
  return view
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function modeTone(mode: AccessControlMode) {
  if (mode === "ENFORCED") return "success" as const;
  if (mode === "SHADOW") return "warning" as const;
  return "neutral" as const;
}

function nextModes(mode: AccessControlMode): AccessControlMode[] {
  if (mode === "LEGACY") return ["SHADOW"];
  if (mode === "SHADOW") return ["ENFORCED", "LEGACY"];
  return ["SHADOW", "LEGACY"];
}

function modeDescription(mode: AccessControlMode) {
  if (mode === "ENFORCED") return "Persona permissions and visible areas are authoritative.";
  if (mode === "SHADOW") return "New decisions are evaluated while legacy access remains authoritative.";
  return "Existing role behavior remains authoritative while profiles are prepared.";
}

function mutationErrorMessage(caught: unknown, fallback: string) {
  if (!(caught instanceof Error)) return fallback;
  const concise = caught.message.match(/Uncaught Error:\s*([^\n]+)/)?.[1]?.trim();
  return concise || caught.message;
}

function ProfileTabs({
  profiles,
  selected,
  onSelect,
}: {
  profiles: ProfileSummary[];
  selected: PersonaKey;
  onSelect: (persona: PersonaKey) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Access profiles">
      {PERSONA_KEYS.map((persona) => {
        const profile = profiles.find((item) => item.systemKey === persona);
        const defaults = ACCESS_PROFILE_DEFAULTS[persona];
        const active = selected === persona;
        return (
          <button
            key={persona}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(persona)}
            className={cn(
              "rounded-xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-info-accent bg-info-soft"
                : "border-line bg-surface-1 hover:border-line-strong",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink">{defaults.name}</span>
              <StatusBadge tone="neutral">{profile ? `v${profile.version}` : "Not set up"}</StatusBadge>
            </div>
            <p className={cn("mt-2 line-clamp-2 text-[11px] leading-relaxed", active ? "text-ink-secondary" : "text-ink-muted")}>{defaults.description}</p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <Users size={12} aria-hidden />
              {profile?.assignments.active ?? 0} active
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function AccessProfilesView({ tenantId }: { tenantId: Id<"tenants"> }) {
  const administration = useQuery(api.accessProfiles.listForAdministration, { tenantId });
  const coverage = useQuery(api.accessProfiles.getAuthorizationCoverage, { tenantId });
  const ensureProfiles = useMutation(api.accessProfiles.ensureSystemProfiles);
  const updateProfile = useMutation(api.accessProfiles.updateProfile);
  const restoreRevision = useMutation(api.accessProfiles.restoreRevision);
  const setMode = useMutation(api.accessProfiles.setAccessControlMode);

  const [selectedPersona, setSelectedPersona] = useState<PersonaKey>("EXECUTIVE");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ProfileDraft | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [pendingMode, setPendingMode] = useState<AccessControlMode | null>(null);
  const [modeReason, setModeReason] = useState("");
  const [restoreId, setRestoreId] = useState<Id<"accessProfileRevisions"> | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const profiles = (administration?.profiles ?? []) as ProfileSummary[];
  const selectedProfile = profiles.find((profile) => profile.systemKey === selectedPersona);
  const revisions = useQuery(
    api.accessProfiles.listRevisions,
    administration?.initialized ? { tenantId, systemKey: selectedPersona } : "skip",
  );
  const preview = useQuery(
    api.accessProfiles.previewUpdate,
    previewDraft ? { tenantId, systemKey: selectedPersona, proposed: previewDraft } : "skip",
  );

  const coverageByView = useMemo(
    () => new Map((coverage ?? []).map((item) => [item.view, item.status as CoverageStatus])),
    [coverage],
  );

  useEffect(() => {
    if (!selectedProfile) {
      setDraft(null);
      return;
    }
    setDraft({
      permissions: selectedProfile.permissions as AccessPermission[],
      visibleViews: selectedProfile.visibleViews as AccessViewKey[],
      defaultLandingView: selectedProfile.defaultLandingView as AccessViewKey,
      defaultScopeLens: selectedProfile.defaultScopeLens,
    });
    setPreviewDraft(null);
    setChangeReason("");
  }, [selectedProfile?.roleId, selectedProfile?.version]);

  const changed = useMemo(() => {
    if (!selectedProfile || !draft) return false;
    return JSON.stringify({
      permissions: [...draft.permissions].sort(),
      visibleViews: [...draft.visibleViews].sort(),
      defaultLandingView: draft.defaultLandingView,
      defaultScopeLens: draft.defaultScopeLens,
    }) !== JSON.stringify({
      permissions: [...selectedProfile.permissions].sort(),
      visibleViews: [...selectedProfile.visibleViews].sort(),
      defaultLandingView: selectedProfile.defaultLandingView,
      defaultScopeLens: selectedProfile.defaultScopeLens,
    });
  }, [draft, selectedProfile]);

  const initialize = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await ensureProfiles({ tenantId });
      setNotice(result.created.length > 0
        ? `${result.created.length} canonical access profiles initialized.`
        : "All canonical access profiles are already initialized.");
    } catch (caught) {
      setError(mutationErrorMessage(caught, "Access profiles could not be initialized."));
    } finally {
      setBusy(false);
    }
  };

  const toggleView = (view: AccessViewKey) => {
    if (!draft) return;
    setPreviewDraft(null);
    const enabled = draft.visibleViews.includes(view);
    if (enabled) {
      const visibleViews = draft.visibleViews.filter((item) => item !== view);
      const defaultLandingView = draft.defaultLandingView === view
        ? visibleViews[0] ?? draft.defaultLandingView
        : draft.defaultLandingView;
      setDraft({ ...draft, visibleViews, defaultLandingView });
      return;
    }
    const required = ACCESS_VIEW_REQUIREMENTS[view];
    setDraft({
      ...draft,
      visibleViews: [...draft.visibleViews, view],
      permissions: draft.permissions.includes(required)
        ? draft.permissions
        : [...draft.permissions, required],
    });
  };

  const togglePermission = (permission: AccessPermission) => {
    if (!draft) return;
    setPreviewDraft(null);
    setDraft({
      ...draft,
      permissions: draft.permissions.includes(permission)
        ? draft.permissions.filter((item) => item !== permission)
        : [...draft.permissions, permission],
    });
  };

  const activate = async () => {
    if (!selectedProfile || !previewDraft || !preview?.valid) return;
    setBusy(true);
    setError("");
    try {
      const result = await updateProfile({
        tenantId,
        systemKey: selectedPersona,
        expectedVersion: selectedProfile.version,
        proposed: previewDraft,
        reason: changeReason,
      });
      setNotice(`${selectedProfile.name} version ${result.version} is active.`);
      setPreviewDraft(null);
      setChangeReason("");
    } catch (caught) {
      setError(mutationErrorMessage(caught, "The access profile was not changed."));
    } finally {
      setBusy(false);
    }
  };

  const transitionMode = async () => {
    if (!administration || !pendingMode) return;
    setBusy(true);
    setError("");
    try {
      await setMode({
        tenantId,
        expectedMode: administration.mode,
        nextMode: pendingMode,
        reason: modeReason,
      });
      setNotice(`Access control is now ${pendingMode.toLowerCase()}.`);
      setPendingMode(null);
      setModeReason("");
    } catch (caught) {
      setError(mutationErrorMessage(caught, "The rollout mode was not changed."));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!restoreId || !selectedProfile) return;
    setBusy(true);
    setError("");
    try {
      const result = await restoreRevision({
        tenantId,
        systemKey: selectedPersona,
        revisionId: restoreId,
        expectedVersion: selectedProfile.version,
        reason: restoreReason,
      });
      setNotice(`${selectedProfile.name} was restored as version ${result.version}.`);
      setRestoreId(null);
      setRestoreReason("");
    } catch (caught) {
      setError(mutationErrorMessage(caught, "The revision was not restored."));
    } finally {
      setBusy(false);
    }
  };

  if (!administration || !coverage) {
    return (
      <div className="space-y-4 p-6" role="status" aria-label="Loading access profiles">
        <div className="h-28 animate-pulse rounded-xl border border-line bg-surface-2" />
        <div className="h-72 animate-pulse rounded-xl border border-line bg-surface-2" />
      </div>
    );
  }

  const mode = administration.mode as AccessControlMode;
  const defaults = ACCESS_PROFILE_DEFAULTS[selectedPersona];
  const uncoveredConfiguredViews = [...new Set(
    profiles.flatMap((profile) => profile.visibleViews).filter((view) => {
      const status = coverageByView.get(view as AccessViewKey);
      return status !== "ENFORCED" && status !== "BROWSER_PROVEN";
    }),
  )];
  const enforcementReady = administration.initialized && uncoveredConfiguredViews.length === 0;

  return (
    <div className="min-h-full bg-app">
      <PageHeader
        eyebrow="Settings / Authorization"
        title="Access Profiles"
        description="Define the default experience and bounded authority for Executives, Architects, Builders, and Admins. Server authorization remains authoritative."
        icon={<KeyRound size={18} aria-hidden />}
        status={<StatusBadge tone={modeTone(mode)}>{mode}</StatusBadge>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {nextModes(mode).map((nextMode) => (
              <Button
                key={nextMode}
                variant={nextMode === "ENFORCED" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setError("");
                  setPendingMode(nextMode);
                }}
                disabled={nextMode === "ENFORCED" && !enforcementReady}
                title={nextMode === "ENFORCED" && !enforcementReady ? "Configured areas still require complete server authorization coverage." : undefined}
              >
                {nextMode === "ENFORCED"
                  ? enforcementReady ? "Enable enforcement" : "Enforcement blocked"
                  : `Move to ${nextMode.toLowerCase()}`}
              </Button>
            ))}
          </div>
        }
      />

      <div className="mx-auto flex max-w-[1480px] flex-col gap-5 px-4 py-5 sm:px-6">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <ShieldCheck size={15} aria-hidden />
                Rollout posture
              </div>
              <p className="mt-1 text-[12px] text-ink-secondary">{modeDescription(mode)}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink-muted">
              <StatusBadge tone={administration.initialized ? "success" : "warning"}>
                {administration.initialized ? "4 profiles ready" : `${profiles.length}/4 profiles ready`}
              </StatusBadge>
              <span>{coverage.filter((item) => item.status === "ENFORCED").length} configurable areas</span>
              {uncoveredConfiguredViews.length > 0 ? <span>· {uncoveredConfiguredViews.length} coverage blockers</span> : null}
            </div>
          </div>
        </Card>

        {notice ? <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success">{notice}</div> : null}
        {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div> : null}

        {!administration.initialized ? (
          <Card className="p-6 text-center">
            <LockKeyhole className="mx-auto h-8 w-8 text-ink-muted" aria-hidden />
            <h2 className="mt-3 text-[16px] font-semibold text-ink">Initialize the canonical profiles</h2>
            <p className="mx-auto mt-2 max-w-xl text-[12px] leading-relaxed text-ink-secondary">
              This creates one versioned system profile for each persona. It does not assign members or enable enforcement.
            </p>
            <Button className="mt-4" onClick={initialize} disabled={busy}>{busy ? "Initializing…" : "Initialize profiles"}</Button>
          </Card>
        ) : (
          <>
            <ProfileTabs profiles={profiles} selected={selectedPersona} onSelect={setSelectedPersona} />

            {selectedProfile && draft ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Default landing", labelForView(draft.defaultLandingView)],
                    ["Default scope", labelForView(draft.defaultScopeLens.toLowerCase())],
                    ["Visible areas", String(draft.visibleViews.length)],
                    ["Capabilities", String(draft.permissions.length)],
                  ].map(([label, value]) => (
                    <Card key={label} className="p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{label}</div>
                      <div className="mt-1 text-[15px] font-semibold text-ink">{value}</div>
                    </Card>
                  ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
                  <div className="space-y-5">
                    <Card className="overflow-hidden">
                      <div className="border-b border-line px-5 py-4">
                        <h2 className="text-[15px] font-semibold text-ink">Visible areas</h2>
                        <p className="mt-1 text-[12px] text-ink-muted">A route must be visible and its read permission granted. Areas without completed server coverage cannot be newly enabled.</p>
                      </div>
                      <div className="grid gap-2 p-4 md:grid-cols-2">
                        {SUPPORTED_ACCESS_VIEWS.map((view) => {
                          const checked = draft.visibleViews.includes(view);
                          const status = coverageByView.get(view) ?? "UNINVENTORIED";
                          const eligible = status === "ENFORCED" || status === "BROWSER_PROVEN";
                          const disabled = !checked && !eligible;
                          return (
                            <label key={view} className={cn("flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3", disabled ? "cursor-not-allowed opacity-65" : "cursor-pointer hover:border-line-strong")}>
                              <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={() => toggleView(view)} />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[12.5px] font-medium text-ink">{labelForView(view)}</span>
                                  <StatusBadge tone={eligible ? "success" : "neutral"}>{status.replace(/_/g, " ")}</StatusBadge>
                                </span>
                                <span className="mt-1 block truncate font-mono text-[10.5px] text-ink-muted">{ACCESS_VIEW_REQUIREMENTS[view]}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </Card>

                    <Card className="overflow-hidden">
                      <div className="border-b border-line px-5 py-4">
                        <h2 className="text-[15px] font-semibold text-ink">Capabilities</h2>
                        <p className="mt-1 text-[12px] text-ink-muted">Action permissions are enforced by server guards and authoritative resource scope.</p>
                      </div>
                      <div className="space-y-5 p-5">
                        {GROUP_ORDER.map((group) => (
                          <fieldset key={group}>
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{GROUP_LABELS[group]}</legend>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              {ALL_ACCESS_PERMISSIONS.filter((permission) => ACCESS_PERMISSION_DETAILS[permission].group === group).map((permission) => {
                                const detail = ACCESS_PERMISSION_DETAILS[permission];
                                const checked = draft.permissions.includes(permission);
                                const locked = selectedPersona === "ADMIN";
                                return (
                                  <label key={permission} className={cn("flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3", locked ? "cursor-not-allowed" : "cursor-pointer hover:border-line-strong")}>
                                    <input type="checkbox" className="mt-0.5" checked={checked} disabled={locked} onChange={() => togglePermission(permission)} />
                                    <span className="min-w-0">
                                      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                                        {detail.label}
                                        {locked ? <LockKeyhole size={11} aria-label={(ADMIN_LOCKED_PERMISSIONS as readonly string[]).includes(permission) ? "Required for Admin recovery safety" : "Admin retains every registered capability"} /> : null}
                                      </span>
                                      <span className="mt-1 block text-[11px] leading-relaxed text-ink-muted">{detail.description}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        ))}
                      </div>
                    </Card>
                  </div>

                  <div className="space-y-5">
                    <Card className="p-5">
                      <h2 className="text-[15px] font-semibold text-ink">Experience defaults</h2>
                      <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="landing-view">Landing view</Label>
                          <Select value={draft.defaultLandingView} onValueChange={(value) => { setPreviewDraft(null); setDraft({ ...draft, defaultLandingView: value as AccessViewKey }); }}>
                            <SelectTrigger id="landing-view"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {draft.visibleViews.map((view) => <SelectItem key={view} value={view}>{labelForView(view)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="scope-lens">Default scope lens</Label>
                          <Select value={draft.defaultScopeLens} onValueChange={(value) => { setPreviewDraft(null); setDraft({ ...draft, defaultScopeLens: value as ScopeLens }); }}>
                            <SelectTrigger id="scope-lens"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SCOPE_LENSES.filter((scope) =>
                                (PERSONA_SCOPE_LENSES[selectedPersona] as readonly ScopeLens[]).includes(scope)
                              ).map((scope) => <SelectItem key={scope} value={scope}>{labelForView(scope.toLowerCase())}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-5">
                      <h2 className="text-[15px] font-semibold text-ink">Impact and activation</h2>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-line bg-surface-2 p-3">
                          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">Members affected</div>
                          <div className="mt-1 text-lg font-semibold text-ink">{selectedProfile.assignments.active}</div>
                        </div>
                        <div className="rounded-lg border border-line bg-surface-2 p-3">
                          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">Active revision</div>
                          <div className="mt-1 text-lg font-semibold text-ink">v{selectedProfile.version}</div>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1.5">
                        <Label htmlFor="change-reason">Change reason</Label>
                        <Textarea id="change-reason" value={changeReason} onChange={(event) => setChangeReason(event.target.value)} maxLength={1000} placeholder="Explain why this access change is needed…" />
                      </div>
                      <Button
                        className="mt-4 w-full"
                        disabled={!changed || changeReason.trim().length < 3}
                        onClick={() => {
                          setError("");
                          setPreviewDraft(draft);
                        }}
                      >
                        Preview changes
                      </Button>
                    </Card>

                    <Card className="overflow-hidden">
                      <div className="flex items-center justify-between border-b border-line px-5 py-4">
                        <div>
                          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><History size={15} aria-hidden /> Revision history</h2>
                          <p className="mt-1 text-[12px] text-ink-muted">Restore creates a new immutable revision.</p>
                        </div>
                      </div>
                      <div className="divide-y divide-line">
                        {!revisions ? (
                          <div className="p-5 text-[12px] text-ink-muted">Loading history…</div>
                        ) : revisions.length === 0 ? (
                          <div className="p-5 text-[12px] text-ink-muted">No profile revisions yet.</div>
                        ) : revisions.slice(0, 8).map((revision) => (
                          <div key={revision._id} className="flex items-start justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                                Version {revision.version}
                                {revision.version === selectedProfile.version ? <StatusBadge tone="success">Active</StatusBadge> : null}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-muted"><Clock3 size={11} aria-hidden />{new Date(revision.createdAt).toLocaleString()} · {revision.actorId}</div>
                              <p className="mt-1 line-clamp-2 text-[11px] text-ink-secondary">{revision.reason}</p>
                            </div>
                            {revision.version !== selectedProfile.version ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setError("");
                                  setRestoreReason("");
                                  setRestoreId(revision._id);
                                }}
                              ><RotateCcw size={12} />Restore</Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </div>
              </>
            ) : (
              <Card className="p-6 text-[12px] text-ink-muted">{defaults.name} is not initialized.</Card>
            )}
          </>
        )}
      </div>

      <Dialog open={previewDraft !== null} onOpenChange={(open) => !open && setPreviewDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activate {defaults.name} profile changes?</DialogTitle>
            <DialogDescription>The complete profile will be validated again and activated atomically as a new immutable revision.</DialogDescription>
          </DialogHeader>
          {!preview ? (
            <div role="status" className="py-6 text-center text-[12px] text-ink-muted">Validating impact…</div>
          ) : !preview.valid ? (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger">{preview.errors.join(" ")}</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Capabilities added", preview.diff.permissionsAdded],
                ["Capabilities removed", preview.diff.permissionsRemoved],
                ["Areas added", preview.diff.viewsAdded],
                ["Areas removed", preview.diff.viewsRemoved],
              ].map(([label, items]) => (
                <div key={label as string} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="text-[11px] font-semibold text-ink-secondary">{label as string}</div>
                  <div className="mt-1 text-[11px] text-ink-muted">{(items as string[]).length > 0 ? (items as string[]).join(", ") : "None"}</div>
                </div>
              ))}
              <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 text-[12px] text-ink-secondary">
                <Users size={14} aria-hidden /> {preview.affectedMembers} active member{preview.affectedMembers === 1 ? "" : "s"} will receive this profile reactively.
              </div>
            </div>
          )}
          {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger">{error}</div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDraft(null)} disabled={busy}>Cancel</Button>
            <Button onClick={activate} disabled={busy || !preview?.valid}>{busy ? "Activating…" : "Activate profile"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingMode !== null} onOpenChange={(open) => !open && setPendingMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change access control to {pendingMode?.toLowerCase()}?</DialogTitle>
            <DialogDescription>{pendingMode ? modeDescription(pendingMode) : null} Enforced mode requires all profiles and at least one active Admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mode-reason">Change reason</Label>
            <Textarea id="mode-reason" value={modeReason} onChange={(event) => setModeReason(event.target.value)} maxLength={1000} placeholder="Record the rollout or rollback reason…" />
          </div>
          {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger">{error}</div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMode(null)} disabled={busy}>Cancel</Button>
            <Button onClick={transitionMode} disabled={busy || modeReason.trim().length < 3}>{busy ? "Changing…" : "Confirm mode"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreId !== null} onOpenChange={(open) => !open && setRestoreId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this {defaults.name} revision?</DialogTitle>
            <DialogDescription>The historical snapshot remains unchanged. Restoration creates and activates a new version.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="restore-reason">Restore reason</Label>
            <Textarea id="restore-reason" value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} maxLength={1000} placeholder="Explain why this revision should be restored…" />
          </div>
          {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger">{error}</div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreId(null)} disabled={busy}>Cancel</Button>
            <Button onClick={restore} disabled={busy || restoreReason.trim().length < 3}>{busy ? "Restoring…" : "Restore as new version"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
