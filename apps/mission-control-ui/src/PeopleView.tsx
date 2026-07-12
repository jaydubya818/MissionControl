import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { AddPersonModal } from "./AddPersonModal";
import { EditPersonModal } from "./EditPersonModal";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { UserPlus, Search, Users, Shield, Mail, Building2 } from "lucide-react";

interface PeopleViewProps {
  projectId: Id<"projects"> | null;
}

const ROLE_BADGE_TONES: Record<string, StatusBadgeProps["tone"]> = {
  OWNER: "warning",
  ADMIN: "error",
  MANAGER: "info",
  MEMBER: "neutral",
  VIEWER: "neutral",
};

const ACCESS_LEVEL_CLASSES: Record<string, string> = {
  ADMIN: "text-err",
  EDIT: "text-warn",
};

export function PeopleView({ projectId }: PeopleViewProps) {
  const orgMembers = useQuery(api.orgMembers.list, {
    projectId: projectId ?? undefined,
  });
  const projects = useQuery(api.projects.list);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editMember, setEditMember] = useState<Doc<"orgMembers"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  if (!orgMembers) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          <div className="h-[620px] animate-pulse rounded-xl border border-line bg-surface-2" />
        </div>
      </main>
    );
  }

  const filtered = orgMembers.filter((member) => {
    const matchesSearch =
      !searchQuery ||
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.email && member.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      member.role.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = !roleFilter || ((member as any).systemRole || "MEMBER") === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleCounts: Record<string, number> = {};
  orgMembers.forEach((member) => {
    const role = (member as any).systemRole || "MEMBER";
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });

  const activeCount = orgMembers.filter((member) => member.active).length;
  const leadershipCount = orgMembers.filter((member) => ["OWNER", "ADMIN", "MANAGER"].includes((member as any).systemRole || "MEMBER")).length;

  const getProjectName = (pid: Id<"projects">) => {
    return projects?.find((project) => project._id === pid)?.name || "Unknown";
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="People"
        description="Directory, role posture, and project access across the operating team."
        eyebrow="Comms"
        icon={<Users size={16} strokeWidth={1.7} />}
        status={<StatusBadge tone="neutral">{orgMembers.length} members</StatusBadge>}
        actions={
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4" />
            Add member
          </Button>
        }
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock label="Team size" value={orgMembers.length} detail="People available in the directory" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Active now" value={activeCount} detail="Members currently marked active" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Leadership" value={leadershipCount} detail="Owner, admin, and manager roles" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Role filters" value={Object.keys(roleCounts).length} detail="Distinct role groups in this workspace" />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-[420px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, email, or role"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  aria-label="Search team members"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label={`All (${orgMembers.length})`}
                  active={roleFilter === null}
                  onClick={() => setRoleFilter(null)}
                />
                {["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"].map((role) =>
                  roleCounts[role] ? (
                    <FilterChip
                      key={role}
                      label={`${role} (${roleCounts[role]})`}
                      active={roleFilter === role}
                      onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                    />
                  ) : null
                )}
              </div>
            </div>

            {orgMembers.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Users}
                  title="No team members yet"
                  description="Add the first team member so roles, access, and ownership can be routed clearly."
                  action={
                    <Button onClick={() => setShowAddModal(true)}>
                      <UserPlus className="h-4 w-4" />
                      Add first member
                    </Button>
                  }
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Search}
                  title="No matching members"
                  description="Try widening the search or removing the active role filter."
                />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {filtered.map((member) => (
                  <PersonCard
                    key={member._id}
                    member={member}
                    getProjectName={getProjectName}
                    onClick={() => setEditMember(member)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="text-[15px] font-semibold text-ink">Operator guidance</div>
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                Keep titles and roles current. Team context becomes routing context across the whole system.
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                Use this surface to validate who can see, change, and approve work before issues become access incidents.
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AddPersonModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        projectId={projectId}
      />
      <EditPersonModal
        open={editMember !== null}
        onClose={() => setEditMember(null)}
        member={editMember}
      />
    </main>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors duration-150",
        active
          ? "border-line bg-surface-2 text-ink"
          : "border-line text-ink-muted hover:border-line-strong hover:text-ink-secondary"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface PersonCardProps {
  member: Doc<"orgMembers">;
  getProjectName: (pid: Id<"projects">) => string;
  onClick: () => void;
}

function PersonCard({ member, getProjectName, onClick }: PersonCardProps) {
  const systemRole = (member as any).systemRole || "MEMBER";
  const projectAccess = (member as any).projectAccess as
    | { projectId: Id<"projects">; accessLevel: string }[]
    | undefined;
  const permissions = (member as any).permissions as string[] | undefined;

  return (
    <button
      type="button"
      className="rounded-xl border border-line bg-surface-2 p-5 text-left transition-colors duration-150 hover:border-line-strong"
      onClick={onClick}
      aria-label={`View details for ${member.name}`}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold",
            member.active ? "border-line-strong bg-surface-1 text-ink" : "border-line bg-surface-1 text-ink-muted"
          )}
        >
          {member.avatar || member.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[15px] font-semibold text-ink">{member.name}</div>
            <StatusBadge tone={ROLE_BADGE_TONES[systemRole] ?? "neutral"}>{systemRole}</StatusBadge>
          </div>
          {member.title ? <div className="mt-1 text-[12.5px] text-ink-muted">{member.title}</div> : null}
          <div className="mt-1 text-[13px] text-ink-secondary">{member.role}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        {member.email ? (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
            <Mail size={14} strokeWidth={1.7} />
            <span className="truncate">{member.email}</span>
          </div>
        ) : null}

        {projectAccess && projectAccess.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11.5px] font-medium text-ink-muted">
              <Building2 size={14} strokeWidth={1.7} />
              Project access
            </div>
            <div className="flex flex-wrap gap-1.5">
              {projectAccess.slice(0, 3).map((access) => (
                <span key={access.projectId} className="rounded-md border border-line bg-surface-1 px-2 py-0.5 text-[11.5px] text-ink-secondary">
                  {getProjectName(access.projectId)}
                  <span className={cn("ml-1", ACCESS_LEVEL_CLASSES[access.accessLevel] ?? "text-ink-muted")}>
                    {access.accessLevel}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {permissions && permissions.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11.5px] font-medium text-ink-muted">
              <Shield size={14} strokeWidth={1.7} />
              Permissions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {permissions.slice(0, 4).map((permission) => (
                <StatusBadge key={permission} tone="neutral">
                  {permission}
                </StatusBadge>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
}
