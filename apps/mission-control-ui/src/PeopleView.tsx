import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { AddPersonModal } from "./AddPersonModal";
import { EditPersonModal } from "./EditPersonModal";
import { cn } from "@/lib/utils";

interface PeopleViewProps {
  projectId: Id<"projects"> | null;
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  OWNER: "text-amber-400 bg-amber-500/10 border-amber-400/20",
  ADMIN: "text-red-500 bg-red-500/10 border-red-500/20",
  MANAGER: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  MEMBER: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  VIEWER: "text-slate-500 bg-slate-500/10 border-slate-500/20",
};

const ACCESS_LEVEL_CLASSES: Record<string, string> = {
  ADMIN: "text-red-500",
  EDIT: "text-amber-500",
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
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Loading team...
        </div>
      </main>
    );
  }

  const filtered = orgMembers.filter((m) => {
    const matchesSearch =
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      m.role.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      !roleFilter || (m.systemRole || "MEMBER") === roleFilter;

    return matchesSearch && matchesRole;
  });

  const roleCounts: Record<string, number> = {};
  orgMembers.forEach((m) => {
    const sr = (m as any).systemRole || "MEMBER";
    roleCounts[sr] = (roleCounts[sr] || 0) + 1;
  });

  const getProjectName = (pid: Id<"projects">) => {
    return projects?.find((p) => p._id === pid)?.name || "Unknown";
  };

  return (
    <main className="flex-1 overflow-auto bg-background p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mt-0 mb-1">People</h1>
          <p className="text-base text-muted-foreground mt-0">
            {orgMembers.length} team member{orgMembers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className="px-5 py-2.5 text-sm font-semibold bg-blue-500 hover:bg-blue-600 border-none rounded-lg text-white cursor-pointer transition-opacity whitespace-nowrap"
          onClick={() => setShowAddModal(true)}
        >
          + Add Member
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <input
          className="px-3.5 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm outline-none max-w-[420px] focus:border-blue-500 transition-colors"
          placeholder="Search by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search team members by name, email, or role"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            className={cn(
              "px-3.5 py-1 text-[0.8125rem] font-medium rounded-full border cursor-pointer transition-all",
              roleFilter === null
                ? "border-blue-500 text-blue-500 bg-blue-500/10"
                : "border-border text-muted-foreground bg-transparent hover:text-foreground"
            )}
            onClick={() => setRoleFilter(null)}
          >
            All ({orgMembers.length})
          </button>
          {["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"].map((r) =>
            roleCounts[r] ? (
              <button
                key={r}
                className={cn(
                  "px-3.5 py-1 text-[0.8125rem] font-medium rounded-full border cursor-pointer transition-all",
                  roleFilter === r
                    ? "border-blue-500 text-blue-500 bg-blue-500/10"
                    : "border-border text-muted-foreground bg-transparent hover:text-foreground"
                )}
                onClick={() => setRoleFilter(roleFilter === r ? null : r)}
              >
                {r.charAt(0) + r.slice(1).toLowerCase()} ({roleCounts[r]})
              </button>
            ) : null
          )}
        </div>
      </div>

      {/* People Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
        {filtered.map((member) => (
          <PersonCard
            key={member._id}
            member={member}
            getProjectName={getProjectName}
            onClick={() => setEditMember(member)}
          />
        ))}
      </div>

      {filtered.length === 0 && orgMembers.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <div className="text-2xl font-semibold text-foreground mb-2">No matching members</div>
          <div className="text-base text-muted-foreground">
            Try adjusting your search or filters
          </div>
        </div>
      )}

      {orgMembers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="text-6xl mb-4">👥</div>
          <div className="text-2xl font-semibold text-foreground mb-2">No team members yet</div>
          <div className="text-base text-muted-foreground">
            Add team members to build your directory and assign roles
          </div>
          <button
            className="mt-4 px-5 py-2.5 text-sm font-semibold bg-blue-500 hover:bg-blue-600 border-none rounded-lg text-white cursor-pointer transition-opacity whitespace-nowrap"
            onClick={() => setShowAddModal(true)}
          >
            + Add First Member
          </button>
        </div>
      )}

      {/* Modals */}
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
  const badgeClasses = ROLE_BADGE_CLASSES[systemRole] || ROLE_BADGE_CLASSES.MEMBER;

  return (
    <div
      className="p-5 bg-card border border-border rounded-xl cursor-pointer transition-all hover:border-blue-500/50 flex flex-col gap-3 relative"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${member.name}`}
    >
      {/* Top row: avatar + info */}
      <div className="flex gap-4 items-start">
        <div className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-semibold shrink-0",
          member.active ? "bg-blue-500" : "bg-slate-500"
        )}>
          {member.avatar || member.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold text-foreground mb-0.5">{member.name}</div>
          {member.title && (
            <div className="text-[0.8125rem] text-muted-foreground mb-0.5">{member.title}</div>
          )}
          <div className="text-[0.8125rem] font-medium text-blue-500">{member.role}</div>
        </div>
      </div>

      {/* System role badge */}
      <div className="flex items-center gap-2.5">
        <span className={cn(
          "px-2.5 py-0.5 text-[0.6875rem] font-bold rounded-full tracking-wide uppercase border",
          badgeClasses
        )}>
          {systemRole}
        </span>
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "w-2 h-2 rounded-full",
            member.active ? "bg-emerald-500" : "bg-slate-500"
          )} />
          <span className="text-xs text-muted-foreground">
            {member.active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Email */}
      {member.email && (
        <a
          href={`mailto:${member.email}`}
          className="text-[0.8125rem] text-blue-500 no-underline hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {member.email}
        </a>
      )}

      {/* Project access */}
      {projectAccess && projectAccess.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
          <div className="text-[0.6875rem] font-bold text-muted-foreground uppercase tracking-wide">
            Project Access
          </div>
          <div className="flex flex-wrap gap-1.5">
            {projectAccess.slice(0, 3).map((pa) => (
              <span key={pa.projectId} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-background border border-border rounded-md text-xs">
                <span className="text-muted-foreground">
                  {getProjectName(pa.projectId)}
                </span>
                <span className={cn(
                  "font-semibold text-[0.6875rem]",
                  ACCESS_LEVEL_CLASSES[pa.accessLevel] || "text-blue-500"
                )}>
                  {pa.accessLevel}
                </span>
              </span>
            ))}
            {projectAccess.length > 3 && (
              <span className="px-2.5 py-0.5 text-xs text-muted-foreground bg-background rounded-md border border-border">
                +{projectAccess.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Permissions count */}
      {permissions && permissions.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {permissions.length} permission{permissions.length !== 1 ? "s" : ""}{" "}
          granted
        </div>
      )}

      {/* Responsibilities */}
      {member.responsibilities && member.responsibilities.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
          <div className="text-[0.6875rem] font-bold text-muted-foreground uppercase tracking-wide">
            Responsibilities
          </div>
          <ul className="mt-0 mb-0 pl-4.5">
            {member.responsibilities.slice(0, 3).map((resp, i) => (
              <li key={i} className="text-[0.8125rem] text-muted-foreground leading-relaxed">
                {resp}
              </li>
            ))}
            {member.responsibilities.length > 3 && (
              <li className="text-[0.8125rem] text-muted-foreground leading-relaxed">
                +{member.responsibilities.length - 3} more...
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Edit hint */}
      <div className="absolute bottom-2 right-3 text-[0.6875rem] text-muted-foreground opacity-50">
        Click to edit
      </div>
    </div>
  );
}
