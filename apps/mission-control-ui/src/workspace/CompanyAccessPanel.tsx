import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, KeyRound, Plus, ShieldCheck, UserRoundCog } from "lucide-react";
import {
  ACCESS_PROFILE_DEFAULTS,
  type PersonaKey,
} from "@mission-control/shared";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
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
import { StatusBadge } from "@/components/factory/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PersonaScope = {
  type: "tenant" | "project" | "team";
  id: string;
};

type AssignmentScopes = {
  workspaces: Array<{ id: Id<"projects">; name: string }>;
  teams: Array<{ id: Id<"scrumTeams">; projectId: Id<"projects">; name: string }>;
};

type CompanyMember = Omit<Doc<"operators">, "email" | "authId"> & {
  email?: string;
  authId?: string;
  roles: Doc<"roles">[];
  primaryPersona?: {
    systemKey?: PersonaKey;
    name: string;
    scope?: Doc<"roleAssignments">["scope"];
  };
  personaConflict: boolean;
};

function asPersonaScope(scope: Doc<"roleAssignments">["scope"]): PersonaScope | null {
  if (!scope) return null;
  if (scope.type === "tenant" || scope.type === "project" || scope.type === "team") {
    return { type: scope.type, id: scope.id };
  }
  return null;
}

function defaultScopeForPersona(
  tenantId: Id<"tenants">,
  persona: PersonaKey,
  scopes: AssignmentScopes,
): PersonaScope | null {
  if (persona === "ADMIN" || persona === "EXECUTIVE") {
    return { type: "tenant", id: tenantId };
  }
  const workspace = scopes.workspaces[0];
  if (workspace) return { type: "project", id: workspace.id };
  return persona === "ARCHITECT" ? { type: "tenant", id: tenantId } : null;
}

function PersonaAssignmentFields({
  tenantId,
  accessProfiles,
  scopes,
  persona,
  scope,
  onPersonaChange,
  onScopeChange,
  architectTenantConfirmed,
  onArchitectTenantConfirmed,
}: {
  tenantId: Id<"tenants">;
  accessProfiles: Doc<"roles">[];
  scopes: AssignmentScopes;
  persona: PersonaKey;
  scope: PersonaScope | null;
  onPersonaChange: (persona: PersonaKey, scope: PersonaScope | null) => void;
  onScopeChange: (scope: PersonaScope) => void;
  architectTenantConfirmed: boolean;
  onArchitectTenantConfirmed: (confirmed: boolean) => void;
}) {
  const selectedProfile = accessProfiles.find((profile) => profile.systemKey === persona);
  const scopeValue = scope ? `${scope.type}:${scope.id}` : "";
  const options: Array<{ value: string; label: string; scope: PersonaScope }> = [];
  if (persona === "ADMIN" || persona === "EXECUTIVE" || persona === "ARCHITECT") {
    options.push({
      value: `tenant:${tenantId}`,
      label: persona === "ARCHITECT" ? "Company-wide (elevated)" : "Entire company",
      scope: { type: "tenant", id: tenantId },
    });
  }
  if (persona === "ARCHITECT" || persona === "BUILDER") {
    options.push(...scopes.workspaces.map((workspace) => ({
      value: `project:${workspace.id}`,
      label: `Workspace · ${workspace.name}`,
      scope: { type: "project" as const, id: workspace.id },
    })));
  }
  if (persona === "BUILDER") {
    options.push(...scopes.teams.map((team) => ({
      value: `team:${team.id}`,
      label: `Team · ${team.name}`,
      scope: { type: "team" as const, id: team.id },
    })));
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
      <legend className="px-1 text-xs font-medium text-ink">Primary access persona</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="member-persona">Persona</Label>
          <Select
            value={persona}
            onValueChange={(value) => {
              const nextPersona = value as PersonaKey;
              onArchitectTenantConfirmed(false);
              onPersonaChange(nextPersona, defaultScopeForPersona(tenantId, nextPersona, scopes));
            }}
          >
            <SelectTrigger id="member-persona"><SelectValue /></SelectTrigger>
            <SelectContent>
              {accessProfiles
                .filter((profile) => profile.systemKey)
                .map((profile) => (
                  <SelectItem key={profile._id} value={profile.systemKey!}>{profile.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-persona-scope">Authority scope</Label>
          <Select
            value={scopeValue}
            onValueChange={(value) => {
              const option = options.find((item) => item.value === value);
              if (option) {
                onArchitectTenantConfirmed(false);
                onScopeChange(option.scope);
              }
            }}
          >
            <SelectTrigger id="member-persona-scope"><SelectValue placeholder="Select a scope" /></SelectTrigger>
            <SelectContent>
              {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {selectedProfile ? (
        <div className="rounded-md border border-line bg-surface-1 px-3 py-2 text-[11px] leading-relaxed text-ink-secondary">
          {selectedProfile.description || ACCESS_PROFILE_DEFAULTS[persona].description}
          <span className="mt-1 block text-ink-muted">
            {selectedProfile.visibleViews?.length ?? 0} visible areas · {selectedProfile.permissions.length} capabilities
          </span>
        </div>
      ) : null}
      {persona === "ARCHITECT" && scope?.type === "tenant" ? (
        <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-[11px] leading-relaxed text-ink-secondary">
          <input type="checkbox" className="mt-0.5" checked={architectTenantConfirmed} onChange={(event) => onArchitectTenantConfirmed(event.target.checked)} />
          <span><strong className="text-ink">Confirm company-wide architecture access.</strong> This extends visibility beyond one workspace and should be exceptional.</span>
        </label>
      ) : null}
      {persona === "BUILDER" && options.length === 0 ? (
        <div role="alert" className="flex items-start gap-2 text-[11px] text-warning"><AlertTriangle size={13} aria-hidden />Create a workspace or team before assigning Builder access.</div>
      ) : null}
    </fieldset>
  );
}

function RoleChecklist({
  roles,
  selected,
  onChange,
}: {
  roles: Doc<"roles">[];
  selected: Id<"roles">[];
  onChange: (roleIds: Id<"roles">[]) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
      <legend className="px-1 text-xs font-medium text-ink">Company roles</legend>
      {roles.map((role) => {
        const checked = selected.includes(role._id);
        return (
          <label key={role._id} className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-surface-1">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, role._id]
                    : selected.filter((roleId) => roleId !== role._id)
                )
              }
              className="mt-0.5"
            />
            <span>
              <span className="block text-[12.5px] font-medium text-ink">{role.name}</span>
              <span className="block text-[11px] leading-relaxed text-ink-muted">
                {role.description || "Custom company role"}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function AddMemberDialog({
  tenantId,
  roles,
  accessProfiles,
  scopes,
  onClose,
  onSuccess,
}: {
  tenantId: Id<"tenants">;
  roles: Doc<"roles">[];
  accessProfiles: Doc<"roles">[];
  scopes: AssignmentScopes;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const createMember = useMutation(api.companyMembers.create);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [authId, setAuthId] = useState("");
  const [roleIds, setRoleIds] = useState<Id<"roles">[]>([]);
  const [persona, setPersona] = useState<PersonaKey>("BUILDER");
  const [scope, setScope] = useState<PersonaScope | null>(() =>
    defaultScopeForPersona(tenantId, "BUILDER", scopes)
  );
  const [architectTenantConfirmed, setArchitectTenantConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (!scope) {
        setError("Select an allowed workspace or team scope for this persona.");
        return;
      }
      if (persona === "ARCHITECT" && scope.type === "tenant" && !architectTenantConfirmed) {
        setError("Confirm company-wide Architect access before continuing.");
        return;
      }
      const result = await createMember({
        tenantId,
        name,
        email,
        authId,
        roleIds,
        primaryPersona: { systemKey: persona, scope },
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSuccess(`${name.trim()} now has company access.`);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Company access could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add company member</DialogTitle>
            <DialogDescription>
              Link the exact Clerk user ID. Email is recorded for contact and display only; it does not grant access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Name</Label>
              <Input id="member-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoFocus required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" type="email" value={email} maxLength={254} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-clerk-id">Clerk user ID</Label>
              <Input id="member-clerk-id" value={authId} maxLength={200} onChange={(event) => setAuthId(event.target.value)} placeholder="user_…" required />
              <p className="text-[11px] text-ink-muted">The member can copy this ID from their No company access screen.</p>
            </div>
            <PersonaAssignmentFields
              tenantId={tenantId}
              accessProfiles={accessProfiles}
              scopes={scopes}
              persona={persona}
              scope={scope}
              onPersonaChange={(nextPersona, nextScope) => {
                setPersona(nextPersona);
                setScope(nextScope);
              }}
              onScopeChange={setScope}
              architectTenantConfirmed={architectTenantConfirmed}
              onArchitectTenantConfirmed={setArchitectTenantConfirmed}
            />
            <RoleChecklist roles={roles} selected={roleIds} onChange={setRoleIds} />
          </div>
          {error ? <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              type="submit"
              disabled={submitting || !scope || (persona === "ARCHITECT" && scope.type === "tenant" && !architectTenantConfirmed)}
            >
              {submitting ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageMemberDialog({
  tenantId,
  member,
  roles,
  accessProfiles,
  scopes,
  onClose,
  onSuccess,
}: {
  tenantId: Id<"tenants">;
  member: CompanyMember;
  roles: Doc<"roles">[];
  accessProfiles: Doc<"roles">[];
  scopes: AssignmentScopes;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const updateMemberAccess = useMutation(api.companyMembers.updateMemberAccess);
  const setActive = useMutation(api.companyMembers.setActive);
  const [roleIds, setRoleIds] = useState<Id<"roles">[]>(member.roles.map((role) => role._id));
  const [persona, setPersona] = useState<PersonaKey>(member.primaryPersona?.systemKey ?? "BUILDER");
  const [scope, setScope] = useState<PersonaScope | null>(
    asPersonaScope(member.primaryPersona?.scope) ??
      defaultScopeForPersona(tenantId, member.primaryPersona?.systemKey ?? "BUILDER", scopes)
  );
  const [architectTenantConfirmed, setArchitectTenantConfirmed] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const saveAccess = async () => {
    setSubmitting(true);
    setError("");
    try {
      if (!scope) {
        setError("Select an allowed workspace or team scope for this persona.");
        return;
      }
      if (persona === "ARCHITECT" && scope.type === "tenant" && !architectTenantConfirmed) {
        setError("Confirm company-wide Architect access before continuing.");
        return;
      }
      const result = await updateMemberAccess({
        tenantId,
        operatorId: member._id,
        roleIds,
        primaryPersona: { systemKey: persona, scope },
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSuccess(`${member.name}'s primary persona and supplemental roles were updated.`);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Member access could not be updated.");
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await setActive({ tenantId, operatorId: member._id, active: !member.active });
      if (!result.success) {
        setError(result.error);
        setConfirmStatus(false);
        return;
      }
      onSuccess(`${member.name} was ${member.active ? "deactivated" : "activated"}.`);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Member status could not be changed.");
      setConfirmStatus(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage {member.name}</DialogTitle>
          <DialogDescription>{member.email || "No contact email"} · {member.authId || "Identity not linked"}</DialogDescription>
        </DialogHeader>
        {confirmStatus ? (
          <div className="py-5">
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
              <div className="text-sm font-semibold text-ink">{member.active ? "Deactivate company access?" : "Reactivate company access?"}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
                {member.active
                  ? "The member will immediately lose access. Their history and assignments remain intact."
                  : "The member will regain access using their linked Clerk identity and current roles."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-5">
            {member.personaConflict ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger">
                <AlertTriangle size={14} aria-hidden />Multiple primary personas are assigned. Saving will replace them with one selection.
              </div>
            ) : null}
            <PersonaAssignmentFields
              tenantId={tenantId}
              accessProfiles={accessProfiles}
              scopes={scopes}
              persona={persona}
              scope={scope}
              onPersonaChange={(nextPersona, nextScope) => {
                setPersona(nextPersona);
                setScope(nextScope);
              }}
              onScopeChange={setScope}
              architectTenantConfirmed={architectTenantConfirmed}
              onArchitectTenantConfirmed={setArchitectTenantConfirmed}
            />
            <RoleChecklist roles={roles} selected={roleIds} onChange={setRoleIds} />
            <Button type="button" variant="outline" onClick={() => setConfirmStatus(true)}>
              {member.active ? "Deactivate access" : "Reactivate access"}
            </Button>
          </div>
        )}
        {error ? <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => confirmStatus ? setConfirmStatus(false) : onClose()} disabled={submitting}>
            {confirmStatus ? "Back" : "Cancel"}
          </Button>
          {confirmStatus ? (
            <Button type="button" onClick={changeStatus} disabled={submitting}>{submitting ? "Updating…" : member.active ? "Deactivate" : "Reactivate"}</Button>
          ) : (
            <Button
              type="button"
              onClick={saveAccess}
              disabled={submitting || !scope || (persona === "ARCHITECT" && scope.type === "tenant" && !architectTenantConfirmed)}
            >
              {submitting ? "Saving…" : "Save member access"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompanyAccessPanel({ tenantId }: { tenantId: Id<"tenants"> }) {
  const access = useQuery(api.companyMembers.list, { tenantId });
  const ensureRoles = useMutation(api.companyMembers.ensureDefaultRoles);
  const ensureAccessProfiles = useMutation(api.accessProfiles.ensureSystemProfiles);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<CompanyMember | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [settingUp, setSettingUp] = useState(false);

  if (!access) {
    return <Card className="h-40 animate-pulse bg-surface-2" />;
  }

  const setupRoles = async () => {
    setSettingUp(true);
    setError("");
    try {
      const result = await ensureRoles({ tenantId });
      setNotice(result.created > 0 ? `${result.created} governed roles created.` : "Governed roles are already configured.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Roles could not be initialized.");
    } finally {
      setSettingUp(false);
    }
  };

  const setupAccessProfiles = async () => {
    setSettingUp(true);
    setError("");
    try {
      const result = await ensureAccessProfiles({ tenantId });
      setNotice(result.created.length > 0
        ? `${result.created.length} canonical access profiles created.`
        : "Canonical access profiles are already configured.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access profiles could not be initialized.");
    } finally {
      setSettingUp(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary"><KeyRound size={17} aria-hidden /></div>
          <div>
            <div className="text-[12px] font-medium text-ink-secondary">Company access</div>
            <h2 className="mt-1 text-[16px] font-semibold text-ink">Members and roles</h2>
            <p className="mt-1 text-[12px] text-ink-muted">Clerk proves identity. These assignments determine company authority.</p>
          </div>
        </div>
        {access.canManageMembers ? (
          <div className="flex gap-2">
            {access.accessProfiles.length < 4 && access.canManageAccessProfiles ? (
              <Button variant="outline" size="sm" onClick={setupAccessProfiles} disabled={settingUp}><KeyRound className="h-3.5 w-3.5" />{settingUp ? "Setting up…" : "Set up access profiles"}</Button>
            ) : null}
            {access.roles.length === 0 ? (
              <Button variant="outline" size="sm" onClick={setupRoles} disabled={settingUp}><ShieldCheck className="h-3.5 w-3.5" />{settingUp ? "Setting up…" : "Set up roles"}</Button>
            ) : null}
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={access.accessProfiles.length < 4}><Plus className="h-3.5 w-3.5" />Add member</Button>
          </div>
        ) : null}
      </div>

      {notice ? <div role="status" className="mt-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success">{notice}</div> : null}
      {error ? <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div> : null}

      <div className="mt-4 divide-y divide-line rounded-lg border border-line">
        {access.members.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-ink-muted">No linked company members yet. Configure roles, then provision the first exact Clerk user ID.</div>
        ) : access.members.map((member) => (
          <div key={member._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink">{member.name}</span>
                <StatusBadge tone={member.active ? "success" : "neutral"}>{member.active ? "Active" : "Inactive"}</StatusBadge>
              </div>
              <div className="mt-1 truncate text-[11px] text-ink-muted">{member.email || "No contact email"} · {member.authId || "Identity not linked"}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-secondary">
                {member.personaConflict ? (
                  <StatusBadge tone="error">Persona conflict</StatusBadge>
                ) : member.primaryPersona?.systemKey ? (
                  <StatusBadge tone="info">{ACCESS_PROFILE_DEFAULTS[member.primaryPersona.systemKey].name}</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">No primary persona</StatusBadge>
                )}
                {member.primaryPersona?.scope ? <span>{member.primaryPersona.scope.type} scope</span> : null}
              </div>
              <div className="mt-1 text-[11px] text-ink-secondary">{member.roles.length > 0 ? member.roles.map((role) => role.name).join(", ") : "No company role"}</div>
            </div>
            {access.canManageMembers ? (
              <Button variant="outline" size="sm" onClick={() => setSelectedMember(member)}><UserRoundCog className="h-3.5 w-3.5" />Manage</Button>
            ) : null}
          </div>
        ))}
      </div>

      {addOpen ? (
        <AddMemberDialog
          tenantId={tenantId}
          roles={access.roles}
          accessProfiles={access.accessProfiles}
          scopes={access.assignmentScopes}
          onClose={() => setAddOpen(false)}
          onSuccess={setNotice}
        />
      ) : null}
      {selectedMember ? (
        <ManageMemberDialog
          tenantId={tenantId}
          member={selectedMember}
          roles={access.roles}
          accessProfiles={access.accessProfiles}
          scopes={access.assignmentScopes}
          onClose={() => setSelectedMember(null)}
          onSuccess={setNotice}
        />
      ) : null}
    </Card>
  );
}
