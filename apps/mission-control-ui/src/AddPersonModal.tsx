import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

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
  { value: "ADMIN", label: "Admin", activeClass: "bg-red-500 text-white border-red-500" },
  { value: "EDIT", label: "Edit", activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "VIEW", label: "View", activeClass: "bg-blue-500 text-white border-blue-500" },
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

const inputClasses = "px-3 py-2.5 bg-background border border-border rounded-md text-foreground text-sm outline-none focus:border-blue-500 transition-colors";

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
      <div className="bg-card border border-border rounded-xl w-[min(680px,95vw)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 pt-5">
          <h2 className="text-xl font-semibold text-foreground">Add Team Member</h2>
          <button className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer px-2 py-1 leading-none hover:text-foreground transition-colors" onClick={() => { resetForm(); onClose(); }}>
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-border">
          {(["basics", "access", "permissions"] as const).map((tab) => (
            <button
              key={tab}
              className={cn(
                "px-4 py-2 bg-transparent border-none border-b-2 text-sm font-medium cursor-pointer -mb-px transition-colors",
                activeTab === tab
                  ? "text-blue-500 border-b-blue-500"
                  : "text-muted-foreground border-b-transparent hover:text-foreground"
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
                <label className="text-[0.8125rem] font-semibold text-foreground">Name *</label>
                <input className={inputClasses} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.8125rem] font-semibold text-foreground">Email</label>
                <input className={inputClasses} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.8125rem] font-semibold text-foreground">Job Role *</label>
                  <input className={inputClasses} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Engineer, Designer, PM" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.8125rem] font-semibold text-foreground">Title</label>
                  <input className={inputClasses} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Engineer" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[0.8125rem] font-semibold text-foreground">System Role</label>
                <p className="text-[0.8125rem] text-muted-foreground mb-2 leading-relaxed">
                  Determines base-level access across the platform.
                </p>
                <div className="flex flex-col gap-2">
                  {SYSTEM_ROLES.map((sr) => (
                    <button
                      key={sr.value}
                      className={cn(
                        "flex flex-col gap-0.5 px-4 py-3 bg-background border rounded-lg cursor-pointer text-left transition-colors",
                        systemRole === sr.value
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-border hover:border-blue-500/50"
                      )}
                      onClick={() => handleSystemRoleChange(sr.value)}
                    >
                      <div className="text-sm font-semibold text-foreground">{sr.label}</div>
                      <div className="text-xs text-muted-foreground leading-snug">{sr.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "access" && (
            <div className="flex flex-col gap-4">
              <p className="text-[0.8125rem] text-muted-foreground mb-2 leading-relaxed">
                Grant specific access levels per project. This overrides the
                system role for those projects.
              </p>

              <div className="flex flex-col gap-2 mb-4">
                {projectAccessList.map((pa) => {
                  const proj = projects?.find((p) => p._id === pa.projectId);
                  return (
                    <div key={pa.projectId} className="flex items-center gap-3 px-3 py-2.5 bg-background border border-border rounded-lg">
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {proj?.name || "Unknown"}
                      </span>
                      <div className="flex gap-1">
                        {ACCESS_LEVELS.map((al) => (
                          <button
                            key={al.value}
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium border rounded cursor-pointer transition-all",
                              pa.accessLevel === al.value
                                ? al.activeClass
                                : "border-border bg-transparent text-muted-foreground hover:text-foreground"
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
                        className="bg-transparent border-none text-muted-foreground text-xl cursor-pointer px-1 leading-none hover:text-foreground transition-colors"
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
                  <label className="text-[0.8125rem] font-semibold text-foreground">Add Project</label>
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
                          className="px-3.5 py-1.5 text-[0.8125rem] font-medium bg-transparent border border-dashed border-border rounded-md text-blue-500 cursor-pointer hover:bg-blue-500/10 transition-colors"
                          onClick={() => addProjectAccess(p._id)}
                        >
                          + {p.name}
                        </button>
                      ))}
                  </div>
                  {projects.every((p) =>
                    projectAccessList.some((pa) => pa.projectId === p._id)
                  ) && (
                    <p className="text-[0.8125rem] text-muted-foreground mb-2 leading-relaxed">
                      All projects have been assigned.
                    </p>
                  )}
                </div>
              )}

              {projectAccessList.length === 0 && (
                <div className="flex flex-col items-center py-8 px-4 text-center">
                  <div className="text-4xl mb-3">🔑</div>
                  <div className="text-base font-semibold text-foreground mb-1.5">
                    No project-specific access
                  </div>
                  <div className="text-[0.8125rem] text-muted-foreground max-w-[400px] leading-relaxed">
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
                  <p className="text-[0.8125rem] text-muted-foreground mb-2 leading-relaxed">
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
                  <span className="text-[0.8125rem] text-muted-foreground">
                    Use custom permissions
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.group} className="flex flex-col gap-1.5 p-3 bg-background rounded-lg border border-border">
                    <div className="text-[0.8125rem] font-semibold text-blue-500 mb-1">
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
                          <span className="text-[0.8125rem] text-muted-foreground">
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

        {error && <div className="px-6 py-2 text-red-500 text-[0.8125rem]">{error}</div>}

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-border">
          <button
            className="px-4.5 py-2 text-sm font-medium bg-transparent border border-border rounded-md text-muted-foreground cursor-pointer hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => { resetForm(); onClose(); }}
          >
            Cancel
          </button>
          <button
            className="px-5 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 border-none rounded-md text-white cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Adding..." : "Add Member"}
          </button>
        </div>
      </div>
    </div>
  );
}
