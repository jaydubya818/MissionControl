import { CSSProperties, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// CONSTANTS
// ============================================================================

const SYSTEM_ROLES: { value: SystemRole; label: string; description: string }[] = [
  { value: "OWNER", label: "Owner", description: "Full access to everything. Can manage all users and settings." },
  { value: "ADMIN", label: "Admin", description: "Manage users, all projects, and system settings." },
  { value: "MANAGER", label: "Manager", description: "Manage assigned projects, create tasks, manage agents." },
  { value: "MEMBER", label: "Member", description: "Edit access to assigned projects. Can create and edit tasks." },
  { value: "VIEWER", label: "Viewer", description: "Read-only access. Can view tasks and dashboards." },
];

const ACCESS_LEVELS: { value: AccessLevel; label: string; color: string }[] = [
  { value: "ADMIN", label: "Admin", color: "#ef4444" },
  { value: "EDIT", label: "Edit", color: "#f59e0b" },
  { value: "VIEW", label: "View", color: "#3b82f6" },
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

// Default permissions per system role
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

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgInput: "#0f172a",
  bgHover: "#25334d",
  border: "#334155",
  borderFocus: "#3b82f6",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentPurple: "#8b5cf6",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
  overlay: "rgba(0, 0, 0, 0.6)",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function AddPersonModal({ open, onClose, projectId }: AddPersonModalProps) {
  const projects = useQuery(api.projects.list);
  const createMember = useMutation(api.orgMembers.create);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(""); // job title role, e.g. "Engineer"
  const [title, setTitle] = useState("");
  const [systemRole, setSystemRole] = useState<SystemRole>("MEMBER");
  const [projectAccessList, setProjectAccessList] = useState<ProjectAccess[]>([]);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Tabs
  const [activeTab, setActiveTab] = useState<"basics" | "access" | "permissions">("basics");

  // Reset form when modal closes so stale state doesn't persist
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

  const resetForm = () => {
    setName("");
    setEmail("");
    setRole("");
    setTitle("");
    setSystemRole("MEMBER");
    setProjectAccessList([]);
    setCustomPermissions([]);
    setUseCustomPermissions(false);
    setActiveTab("basics");
    setError("");
  };

  const effectivePermissions = useCustomPermissions
    ? customPermissions
    : ROLE_DEFAULT_PERMISSIONS[systemRole];

  return (
    <div style={styles.overlay} onClick={() => { resetForm(); onClose(); }}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Add Team Member</h2>
          <button style={styles.closeButton} onClick={() => { resetForm(); onClose(); }}>
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(["basics", "access", "permissions"] as const).map((tab) => (
            <button
              key={tab}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "basics" && "Profile"}
              {tab === "access" && "Project Access"}
              {tab === "permissions" && "Permissions"}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={styles.modalBody}>
          {/* ---- BASICS TAB ---- */}
          {activeTab === "basics" && (
            <div style={styles.tabContent}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Name *</label>
                <input
                  style={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Job Role *</label>
                  <input
                    style={styles.input}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Engineer, Designer, PM"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Title</label>
                  <input
                    style={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Engineer"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>System Role</label>
                <p style={styles.helpText}>
                  Determines base-level access across the platform.
                </p>
                <div style={styles.roleGrid}>
                  {SYSTEM_ROLES.map((sr) => (
                    <button
                      key={sr.value}
                      style={{
                        ...styles.roleOption,
                        ...(systemRole === sr.value ? styles.roleOptionActive : {}),
                      }}
                      onClick={() => handleSystemRoleChange(sr.value)}
                    >
                      <div style={styles.roleLabel}>{sr.label}</div>
                      <div style={styles.roleDesc}>{sr.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- ACCESS TAB ---- */}
          {activeTab === "access" && (
            <div style={styles.tabContent}>
              <p style={styles.helpText}>
                Grant specific access levels per project. This overrides the
                system role for those projects.
              </p>

              {/* Projects list */}
              <div style={styles.projectAccessList}>
                {projectAccessList.map((pa) => {
                  const proj = projects?.find((p) => p._id === pa.projectId);
                  return (
                    <div key={pa.projectId} style={styles.projectAccessRow}>
                      <span style={styles.projectName}>
                        {proj?.name || "Unknown"}
                      </span>
                      <div style={styles.accessLevelPicker}>
                        {ACCESS_LEVELS.map((al) => (
                          <button
                            key={al.value}
                            style={{
                              ...styles.accessLevelBtn,
                              ...(pa.accessLevel === al.value
                                ? {
                                    background: al.color,
                                    color: "#fff",
                                    borderColor: al.color,
                                  }
                                : {}),
                            }}
                            onClick={() =>
                              updateProjectAccessLevel(pa.projectId, al.value)
                            }
                          >
                            {al.label}
                          </button>
                        ))}
                      </div>
                      <button
                        style={styles.removeBtn}
                        onClick={() => removeProjectAccess(pa.projectId)}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add project */}
              {projects && projects.length > 0 && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Add Project</label>
                  <div style={styles.addProjectGrid}>
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
                          style={styles.addProjectBtn}
                          onClick={() => addProjectAccess(p._id)}
                        >
                          + {p.name}
                        </button>
                      ))}
                  </div>
                  {projects.every((p) =>
                    projectAccessList.some((pa) => pa.projectId === p._id)
                  ) && (
                    <p style={styles.helpText}>
                      All projects have been assigned.
                    </p>
                  )}
                </div>
              )}

              {projectAccessList.length === 0 && (
                <div style={styles.emptyAccess}>
                  <div style={styles.emptyAccessIcon}>🔑</div>
                  <div style={styles.emptyAccessTitle}>
                    No project-specific access
                  </div>
                  <div style={styles.emptyAccessText}>
                    The member's system role ({systemRole}) will determine their
                    access to all projects. Add specific projects above to
                    override.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- PERMISSIONS TAB ---- */}
          {activeTab === "permissions" && (
            <div style={styles.tabContent}>
              <div style={styles.permissionsHeader}>
                <div>
                  <p style={styles.helpText}>
                    Fine-tune what this member can do. By default, permissions
                    are derived from the system role ({systemRole}).
                  </p>
                </div>
                <label style={styles.toggleLabel}>
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
                  <span style={styles.toggleText}>
                    Use custom permissions
                  </span>
                </label>
              </div>

              <div style={styles.permissionGroups}>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.group} style={styles.permissionGroup}>
                    <div style={styles.permissionGroupTitle}>
                      {group.group}
                    </div>
                    {group.permissions.map((perm) => {
                      const checked = effectivePermissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          style={{
                            ...styles.permissionRow,
                            opacity: useCustomPermissions ? 1 : 0.6,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!useCustomPermissions}
                            onChange={() => togglePermission(perm.key)}
                          />
                          <span style={styles.permissionLabel}>
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

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={() => { resetForm(); onClose(); }}>
            Cancel
          </button>
          <button
            style={styles.submitBtn}
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

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: colors.overlay,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    width: "min(680px, 95vw)",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 24px 0",
  },
  modalTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
  },
  closeButton: {
    background: "none",
    border: "none",
    color: colors.textMuted,
    fontSize: "1.5rem",
    cursor: "pointer",
    padding: "4px 8px",
    lineHeight: 1,
  },
  tabs: {
    display: "flex",
    gap: "4px",
    padding: "16px 24px 0",
    borderBottom: `1px solid ${colors.border}`,
  },
  tab: {
    padding: "8px 16px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: colors.textMuted,
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    marginBottom: "-1px",
    transition: "color 0.15s, border-color 0.15s",
  },
  tabActive: {
    color: colors.accentBlue,
    borderBottomColor: colors.accentBlue,
  },
  modalBody: {
    flex: 1,
    overflow: "auto",
    padding: "20px 24px",
  },
  tabContent: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  label: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: colors.textPrimary,
  },
  helpText: {
    fontSize: "0.8125rem",
    color: colors.textMuted,
    margin: "0 0 8px",
    lineHeight: 1.5,
  },
  input: {
    padding: "10px 12px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    outline: "none",
    transition: "border-color 0.15s",
  },
  roleGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  roleOption: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "12px 16px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.15s, background 0.15s",
  },
  roleOptionActive: {
    borderColor: colors.accentBlue,
    background: "rgba(59, 130, 246, 0.08)",
  },
  roleLabel: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.textPrimary,
  },
  roleDesc: {
    fontSize: "0.75rem",
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  // Access tab
  projectAccessList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginBottom: "16px",
  },
  projectAccessRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  projectName: {
    flex: 1,
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.textPrimary,
  },
  accessLevelPicker: {
    display: "flex",
    gap: "4px",
  },
  accessLevelBtn: {
    padding: "4px 10px",
    fontSize: "0.75rem",
    fontWeight: 500,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    background: "transparent",
    color: colors.textSecondary,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: colors.textMuted,
    fontSize: "1.25rem",
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: 1,
  },
  addProjectGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  addProjectBtn: {
    padding: "6px 14px",
    fontSize: "0.8125rem",
    fontWeight: 500,
    background: "transparent",
    border: `1px dashed ${colors.border}`,
    borderRadius: 6,
    color: colors.accentBlue,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  emptyAccess: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    textAlign: "center",
  },
  emptyAccessIcon: {
    fontSize: "2.5rem",
    marginBottom: "12px",
  },
  emptyAccessTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "6px",
  },
  emptyAccessText: {
    fontSize: "0.8125rem",
    color: colors.textMuted,
    maxWidth: 400,
    lineHeight: 1.5,
  },
  // Permissions tab
  permissionsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  toggleText: {
    fontSize: "0.8125rem",
    color: colors.textSecondary,
  },
  permissionGroups: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "16px",
  },
  permissionGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px",
    background: colors.bgInput,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
  },
  permissionGroupTitle: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: colors.accentBlue,
    marginBottom: "4px",
  },
  permissionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    fontSize: "0.8125rem",
    color: colors.textSecondary,
    padding: "2px 0",
  },
  permissionLabel: {
    fontSize: "0.8125rem",
    color: colors.textSecondary,
  },
  // Footer
  error: {
    padding: "8px 24px",
    color: colors.accentRed,
    fontSize: "0.8125rem",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    padding: "16px 24px",
    borderTop: `1px solid ${colors.border}`,
  },
  cancelBtn: {
    padding: "8px 18px",
    fontSize: "0.875rem",
    fontWeight: 500,
    background: "transparent",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    cursor: "pointer",
  },
  submitBtn: {
    padding: "8px 20px",
    fontSize: "0.875rem",
    fontWeight: 600,
    background: colors.accentBlue,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
};
