import { CSSProperties, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

type SystemRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";
type AccessLevel = "ADMIN" | "EDIT" | "VIEW";

interface ProjectAccess {
  projectId: Id<"projects">;
  accessLevel: AccessLevel;
}

interface EditPersonModalProps {
  open: boolean;
  onClose: () => void;
  member: Doc<"orgMembers"> | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SYSTEM_ROLES: { value: SystemRole; label: string; description: string }[] = [
  { value: "OWNER", label: "Owner", description: "Full access to everything." },
  { value: "ADMIN", label: "Admin", description: "Manage users, all projects." },
  { value: "MANAGER", label: "Manager", description: "Manage assigned projects." },
  { value: "MEMBER", label: "Member", description: "Edit access to assigned projects." },
  { value: "VIEWER", label: "Viewer", description: "Read-only access." },
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
  border: "#334155",
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

export function EditPersonModal({ open, onClose, member }: EditPersonModalProps) {
  const projects = useQuery(api.projects.list);
  const updateMember = useMutation(api.orgMembers.update);
  const removeMember = useMutation(api.orgMembers.remove);

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"basics" | "access" | "permissions">("basics");

  // Populate form from member data — include `open` to reset when
  // the modal re-opens for the same member (member ref unchanged).
  useEffect(() => {
    if (member && open) {
      setName(member.name);
      setEmail(member.email || "");
      setRole(member.role);
      setTitle(member.title || "");
      setSystemRole((member.systemRole as SystemRole) || "MEMBER");
      setProjectAccessList((member.projectAccess as ProjectAccess[]) || []);
      const hasCustom = member.permissions && member.permissions.length > 0;
      setUseCustomPermissions(!!hasCustom);
      setCustomPermissions((member.permissions as string[]) || []);
      setConfirmDelete(false);
      setDeleting(false);
      setError("");
    }
  }, [member, open]);

  if (!open || !member) return null;

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

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!role.trim()) {
      setError("Job role is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateMember({
        id: member._id,
        name: name.trim(),
        email: email.trim() || undefined,
        role: role.trim(),
        title: title.trim() || undefined,
        systemRole,
        projectAccess: projectAccessList.length > 0 ? projectAccessList : [],
        permissions: useCustomPermissions
          ? customPermissions
          : ROLE_DEFAULT_PERMISSIONS[systemRole],
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update member");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await removeMember({ id: member._id });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    } finally {
      setDeleting(false);
    }
  };

  const effectivePermissions = useCustomPermissions
    ? customPermissions
    : ROLE_DEFAULT_PERMISSIONS[systemRole];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Edit Member</h2>
          <button style={styles.closeButton} onClick={onClose}>
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
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Job Role *</label>
                  <input
                    style={styles.input}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Title</label>
                  <input
                    style={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>System Role</label>
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
                Grant specific access levels per project. Overrides the system
                role for those projects.
              </p>

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
                </div>
              )}

              {projectAccessList.length === 0 && (
                <div style={styles.emptyAccess}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>
                    🔑
                  </div>
                  <div
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: colors.textPrimary,
                      marginBottom: "6px",
                    }}
                  >
                    No project-specific access
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: colors.textMuted,
                      maxWidth: 400,
                      lineHeight: 1.5,
                    }}
                  >
                    System role ({systemRole}) applies to all projects.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- PERMISSIONS TAB ---- */}
          {activeTab === "permissions" && (
            <div style={styles.tabContent}>
              <div style={styles.permissionsHeader}>
                <p style={styles.helpText}>
                  Permissions derived from system role ({systemRole}). Toggle
                  custom to override.
                </p>
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
                  <span style={styles.toggleText}>Custom</span>
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

        {error && <div style={styles.error}>{error}</div>}

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button
            style={{
              ...styles.deleteBtn,
              ...(confirmDelete
                ? { background: colors.accentRed, color: "#fff" }
                : {}),
              ...(deleting ? { opacity: 0.5, cursor: "not-allowed" } : {}),
            }}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Removing..." : confirmDelete ? "Confirm Remove?" : "Remove"}
          </button>
          <div style={{ flex: 1 }} />
          <button style={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={styles.submitBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
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
  },
  emptyAccess: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    textAlign: "center",
  },
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
    padding: "2px 0",
  },
  permissionLabel: {
    fontSize: "0.8125rem",
    color: colors.textSecondary,
  },
  error: {
    padding: "8px 24px",
    color: colors.accentRed,
    fontSize: "0.8125rem",
  },
  modalFooter: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "16px 24px",
    borderTop: `1px solid ${colors.border}`,
  },
  deleteBtn: {
    padding: "8px 16px",
    fontSize: "0.875rem",
    fontWeight: 500,
    background: "transparent",
    border: `1px solid ${colors.accentRed}`,
    borderRadius: 6,
    color: colors.accentRed,
    cursor: "pointer",
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
  },
};
