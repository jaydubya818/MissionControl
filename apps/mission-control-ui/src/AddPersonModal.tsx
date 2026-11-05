import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { KeyRound } from "lucide-react";

type SystemRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
type AccessLevel = "ADMIN" | "EDIT" | "VIEW";

interface ProjectAccess {
  projectId: Id<"projects">;
  accessLevel: AccessLevel;
}

interface AddPersonModalProps {
  open: boolean;
  onClose: () => void;
  projectId: Id<"projects"> | null;
}

const SYSTEM_ROLES: { value: SystemRole; label: string; description: string }[] = [
  { value: "OWNER", label: "Owner", description: "Full access to everything. Can manage all users and settings." },
  { value: "ADMIN", label: "Admin", description: "Manage users, all projects, and system settings." },
  { value: "MANAGER", label: "Manager", description: "Manage assigned projects, create tasks, manage agents." },
  { value: "MEMBER", label: "Member", description: "Edit access to assigned projects. Can create and edit tasks." },
  { value: "VIEWER", label: "Viewer", description: "Read-only access. Can view tasks and dashboards." },
];

const ACCESS_LEVELS: { value: AccessLevel; label: string; activeClass: string }[] = [
  { value: "ADMIN", label: "Admin", activeClass: "bg-act text-act-ink border-transparent" },
  { value: "EDIT", label: "Edit", activeClass: "bg-act text-act-ink border-transparent" },
  { value: "VIEW", label: "View", activeClass: "bg-act text-act-ink border-transparent" },
];

const PERMISSION_GROUPS = [
  {
    group: "Tasks",
    permissions: [
      { key: "tasks.create", label: "Create tasks" },
      { key: "tasks.edit", label: "Edit tasks" },
      { key: "tasks.delete", label: "Delete tasks" },
      { key: "tasks.assign", label: "Assign tasks" },
    ],
  },
  {
    group: "Agents",
    permissions: [
      { key: "agents.view", label: "View agents" },
      { key: "agents.manage", label: "Manage agents" },
      { key: "agents.configure", label: "Configure agents" },
    ],
  },
  {
    group: "Approvals",
    permissions: [
      { key: "approvals.view", label: "View approvals" },
      { key: "approvals.decide", label: "Decide approvals" },
    ],
  },
  {
    group: "Budget",
    permissions: [
      { key: "budget.view", label: "View budgets" },
      { key: "budget.manage", label: "Manage budgets" },
    ],
  },
  {
    group: "People",
    permissions: [
      { key: "people.view", label: "View people" },
      { key: "people.manage", label: "Manage people" },
      { key: "people.invite", label: "Invite people" },
    ],
  },
  {
    group: "Projects",
    permissions: [
      { key: "projects.create", label: "Create projects" },
      { key: "projects.edit", label: "Edit projects" },
      { key: "projects.delete", label: "Delete projects" },
    ],
  },
  {
    group: "System",
    permissions: [
      { key: "policies.view", label: "View policies" },
      { key: "policies.manage", label: "Manage policies" },
      { key: "settings.manage", label: "Manage settings" },
    ],
  },
];

const ROLE_DEFAULT_PERMISSIONS: Record<SystemRole, string[]> = {
  OWNER: PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
  ADMIN: PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)).filter(
    (p) => p !== "settings.manage"
  ),
  MANAGER: [
    "tasks.create", "tasks.edit", "tasks.assign",
    "agents.view", "agents.manage",
    "approvals.view", "approvals.decide",
    "budget.view",
    "people.view",
    "projects.edit",
    "policies.view",
  ],
  MEMBER: [
    "tasks.create", "tasks.edit",
    "agents.view",
    "approvals.view",
    "budget.view",
    "people.view",
  ],
  VIEWER: [
    "agents.view",
    "approvals.view",
    "budget.view",
    "people.view",
  ],
};

const inputClasses = "h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted outline-none transition-colors duration-150 focus:border-line-strong";

export function AddPersonModal({ open, onClose, projectId }: AddPersonModalProps) {
  const projects = useQuery(api.projects.list);
  const createMember = useMutation(api.orgMembers.create);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [systemRole, setSystemRole] = useState<SystemRole>("MEMBER");
  const [projectAccessList, setProjectAccessList] = useState<ProjectAccess[]>([]);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"basics" | "access" | "permissions">("basics");

  const resetForm = () => {
    setName("");
    setEmail("");
    setRole("Member");
    setTitle("");
    setSystemRole("MEMBER");
    setProjectAccessList([]);
    setCustomPermissions([]);
    setUseCustomPermissions(false);
    setSaving(false);
    setError("");
    setActiveTab("basics");
  };

  if (!open) return null;

  const handleSystemRoleChange = (newRole: SystemRole) => {
    setSystemRole(newRole);
    if (!useCustomPermissions) {
      setCustomPermissions(ROLE_DEFAULT_PERMISSIONS[newRole]);
    }
  };

  const togglePermission = (perm: string) => {
    setCustomPermissions((prev) =>
      prev.includes(perm)
        ? prev.filter((p) => p !== perm)
        : [...prev, perm]
    );
  };

  const addProjectAccess = (pid: Id<"projects">) => {
    if (projectAccessList.some((pa) => pa.projectId === pid)) return;
    setProjectAccessList((prev) => [
      ...prev,
      { projectId: pid, accessLevel: "EDIT" as AccessLevel },
    ]);
  };

  const updateProjectAccessLevel = (pid: Id<"projects">, level: AccessLevel) => {
    setProjectAccessList((prev) =>
      prev.map((pa) =>
        pa.projectId === pid ? { ...pa, accessLevel: level } : pa
      )
    );
  };

  const removeProjectAccess = (pid: Id<"projects">) => {
    setProjectAccessList((prev) =>
      prev.filter((pa) => pa.projectId !== pid)
    );
  };

  const handleSubmit = async () => {
    if (!projectId) { setError("Select a workspace before adding a person."); return; }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!role.trim()) {
      setError("Role is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await createMember({
        projectId: projectId ?? undefined,
        name: name.trim(),
        email: email.trim() || undefined,
        role: role.trim(),
        title: title.trim() || undefined,
        level: systemRole === "OWNER" ? 0 : systemRole === "ADMIN" ? 1 : 2,
        systemRole,
        projectAccess: projectAccessList.length > 0 ? projectAccessList : undefined,
        permissions: useCustomPermissions ? customPermissions : ROLE_DEFAULT_PERMISSIONS[systemRole],
      });
      resetForm();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  const effectivePermissions = useCustomPermissions
    ? customPermissions
    : ROLE_DEFAULT_PERMISSIONS[systemRole];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={() => { resetForm(); onClose(); }}>
      <div className="bg-surface-3 border border-line rounded-xl shadow-[var(--shadow-elevation-2)] w-[min(680px,95vw)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-5">
          <h2 className="text-[19px] font-semibold text-ink">Add Team Member</h2>
          <button className="bg-transparent border-none text-ink-muted text-2xl cursor-pointer px-2 py-1 leading-none hover:text-ink transition-colors duration-150" onClick={() => { resetForm(); onClose(); }}>
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-line" role="tablist">
          {(["basics", "access", "permissions"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={cn(
                "px-4 py-2 bg-transparent border-b-2 text-[13px] font-medium cursor-pointer -mb-px transition-colors duration-150",
                activeTab === tab
                  ? "text-ink border-b-ink"
                  : "text-ink-muted border-b-transparent hover:text-ink-secondary"
              )}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "basics" && "Profile"}
              {tab === "access" && "Project Access"}
              {tab === "permissions" && "Permissions"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {activeTab === "basics" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Name *</label>
                <input className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Email</label>
                <input className={inputClasses} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-ink">Job Role *</label>
                  <input className={inputClasses} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Engineer, Designer, PM" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-ink">Title</label>
                  <input className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Engineer" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">System Role</label>
                <p className="text-[13px] text-ink-muted mb-2 leading-relaxed">
                  Determines base-level access across the platform.
                </p>
                <div className="flex flex-col gap-2">
                  {SYSTEM_ROLES.map((sr) => (
                    <button
                      key={sr.value}
                      className={cn(
                        "flex flex-col gap-0.5 px-4 py-3 border rounded-lg cursor-pointer text-left transition-colors duration-150",
                        systemRole === sr.value
                          ? "border-line-strong bg-surface-2"
                          : "border-line bg-surface-1 hover:border-line-strong"
                      )}
                      onClick={() => handleSystemRoleChange(sr.value)}
                    >
                      <div className="text-[13.5px] font-semibold text-ink">{sr.label}</div>
                      <div className="text-xs text-ink-muted leading-snug">{sr.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "access" && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-ink-muted mb-2 leading-relaxed">
                Grant specific access levels per project. This overrides the
                system role for those projects.
              </p>

              <div className="flex flex-col gap-2 mb-4">
                {projectAccessList.map((pa) => {
                  const proj = projects?.find((p) => p._id === pa.projectId);
                  return (
                    <div key={pa.projectId} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 border border-line rounded-lg">
                      <span className="flex-1 text-[13.5px] font-medium text-ink">
                        {proj?.name || "Unknown"}
                      </span>
                      <div className="flex gap-1">
                        {ACCESS_LEVELS.map((al) => (
                          <button
                            key={al.value}
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium border rounded-md cursor-pointer transition-colors duration-150",
                              pa.accessLevel === al.value
                                ? al.activeClass
                                : "border-line bg-transparent text-ink-muted hover:text-ink"
                            )}
                            onClick={() =>
                              updateProjectAccessLevel(pa.projectId, al.value)
                            }
                          >
                            {al.label}
                          </button>
                        ))}
                      </div>
                      <button
                        className="bg-transparent border-none text-ink-muted text-xl cursor-pointer px-1 leading-none hover:text-ink transition-colors duration-150"
                        onClick={() => removeProjectAccess(pa.projectId)}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>

              {projects && projects.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-ink">Add Project</label>
                  <div className="flex flex-wrap gap-2">
                    {projects
                      .filter(
                        (p) =>
                          !projectAccessList.some(
                            (pa) => pa.projectId === p._id
                          )
                      )
                      .map((p) => (
                        <button
                          key={p._id}
                          className="px-3.5 py-1.5 text-[13px] font-medium bg-transparent border border-dashed border-line rounded-md text-ink-secondary cursor-pointer hover:text-ink hover:border-line-strong transition-colors duration-150"
                          onClick={() => addProjectAccess(p._id)}
                        >
                          + {p.name}
                        </button>
                      ))}
                  </div>
                  {projects.every((p) =>
                    projectAccessList.some((pa) => pa.projectId === p._id)
                  ) && (
                    <p className="text-[13px] text-ink-muted mb-2 leading-relaxed">
                      All projects have been assigned.
                    </p>
                  )}
                </div>
              )}

              {projectAccessList.length === 0 && (
                <div className="flex flex-col items-center py-8 px-4 text-center">
                  <KeyRound className="h-7 w-7 mb-3 text-ink-muted" strokeWidth={1.5} />
                  <div className="text-[15px] font-semibold text-ink mb-1.5">
                    No project-specific access
                  </div>
                  <div className="text-[13px] text-ink-muted max-w-[400px] leading-relaxed">
                    The member's system role ({systemRole}) will determine their
                    access to all projects. Add specific projects above to
                    override.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "permissions" && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-[13px] text-ink-muted mb-2 leading-relaxed">
                    Fine-tune what this member can do. By default, permissions
                    are derived from the system role ({systemRole}).
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0">
                  <input
                    type="checkbox"
                    checked={useCustomPermissions}
                    onChange={(e) => {
                      setUseCustomPermissions(e.target.checked);
                      if (e.target.checked) {
                        setCustomPermissions(
                          ROLE_DEFAULT_PERMISSIONS[systemRole]
                        );
                      }
                    }}
                  />
                  <span className="text-[13px] text-ink-muted">
                    Use custom permissions
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.group} className="flex flex-col gap-1.5 p-3 bg-surface-2 rounded-lg border border-line">
                    <div className="text-[13px] font-semibold text-ink mb-1">
                      {group.group}
                    </div>
                    {group.permissions.map((perm) => {
                      const checked = effectivePermissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={cn(
                            "flex items-center gap-2 cursor-pointer py-0.5",
                            !useCustomPermissions && "opacity-60"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!useCustomPermissions}
                            onChange={() => togglePermission(perm.key)}
                          />
                          <span className="text-[13px] text-ink-muted">
                            {perm.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!projectId && <div role="status" className="px-6 py-2 text-ink-secondary text-[13px]">Select a workspace before adding a person.</div>}
        {error && <div role="alert" className="px-6 py-2 text-err text-[13px]">{error}</div>}

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-line">
          <button
            className="h-9 px-3 rounded-lg text-[13px] font-medium bg-transparent border border-line text-ink-secondary cursor-pointer hover:text-ink hover:border-line-strong transition-colors duration-150"
            onClick={() => { resetForm(); onClose(); }}
          >
            Cancel
          </button>
          <button
            className="h-9 px-3 rounded-lg text-[13px] font-medium bg-act text-act-ink border-none cursor-pointer transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!projectId ? "Select a workspace before adding a person" : undefined}
            onClick={handleSubmit}
            disabled={saving || !projectId}
          >
            {saving ? "Adding..." : "Add Member"}
          </button>
        </div>
      </div>
    </div>
  );
}
