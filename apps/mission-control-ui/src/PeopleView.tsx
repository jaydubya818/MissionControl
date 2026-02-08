import { CSSProperties, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { AddPersonModal } from "./AddPersonModal";
import { EditPersonModal } from "./EditPersonModal";

interface PeopleViewProps {
  projectId: Id<"projects"> | null;
}

// ============================================================================
// ROLE BADGE CONFIG
// ============================================================================

const ROLE_BADGE_CONFIG: Record<string, { color: string; bg: string }> = {
  OWNER: { color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)" },
  ADMIN: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" },
  MANAGER: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" },
  MEMBER: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)" },
  VIEWER: { color: "#64748b", bg: "rgba(100, 116, 139, 0.12)" },
};

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentPurple: "#8b5cf6",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
};

// ============================================================================
// MAIN VIEW
// ============================================================================

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
      <main style={styles.container}>
        <div style={styles.loading}>Loading team...</div>
      </main>
    );
  }

  // Filter members
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

  // Count by role
  const roleCounts: Record<string, number> = {};
  orgMembers.forEach((m) => {
    const sr = (m as any).systemRole || "MEMBER";
    roleCounts[sr] = (roleCounts[sr] || 0) + 1;
  });

  const getProjectName = (pid: Id<"projects">) => {
    return projects?.find((p) => p._id === pid)?.name || "Unknown";
  };

  return (
    <main style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>People</h1>
          <p style={styles.subtitle}>
            {orgMembers.length} team member{orgMembers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button style={styles.addButton} onClick={() => setShowAddModal(true)}>
          + Add Member
        </button>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          style={styles.searchInput}
          placeholder="Search by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search team members by name, email, or role"
        />
        <div style={styles.roleFilters}>
          <button
            style={{
              ...styles.filterChip,
              ...(roleFilter === null ? styles.filterChipActive : {}),
            }}
            onClick={() => setRoleFilter(null)}
          >
            All ({orgMembers.length})
          </button>
          {["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"].map((r) =>
            roleCounts[r] ? (
              <button
                key={r}
                style={{
                  ...styles.filterChip,
                  ...(roleFilter === r ? styles.filterChipActive : {}),
                }}
                onClick={() => setRoleFilter(roleFilter === r ? null : r)}
              >
                {r.charAt(0) + r.slice(1).toLowerCase()} ({roleCounts[r]})
              </button>
            ) : null
          )}
        </div>
      </div>

      {/* People Grid */}
      <div style={styles.peopleGrid}>
        {filtered.map((member) => (
          <PersonCard
            key={member._id}
            member={member}
            projects={projects || []}
            getProjectName={getProjectName}
            onClick={() => setEditMember(member)}
          />
        ))}
      </div>

      {filtered.length === 0 && orgMembers.length > 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🔍</div>
          <div style={styles.emptyTitle}>No matching members</div>
          <div style={styles.emptyText}>
            Try adjusting your search or filters
          </div>
        </div>
      )}

      {orgMembers.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>👥</div>
          <div style={styles.emptyTitle}>No team members yet</div>
          <div style={styles.emptyText}>
            Add team members to build your directory and assign roles
          </div>
          <button
            style={{ ...styles.addButton, marginTop: "16px" }}
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

// ============================================================================
// PERSON CARD
// ============================================================================

interface PersonCardProps {
  member: Doc<"orgMembers">;
  projects: Doc<"projects">[];
  getProjectName: (pid: Id<"projects">) => string;
  onClick: () => void;
}

function PersonCard({ member, projects, getProjectName, onClick }: PersonCardProps) {
  const systemRole = (member as any).systemRole || "MEMBER";
  const projectAccess = (member as any).projectAccess as
    | { projectId: Id<"projects">; accessLevel: string }[]
    | undefined;
  const permissions = (member as any).permissions as string[] | undefined;
  const badge = ROLE_BADGE_CONFIG[systemRole] || ROLE_BADGE_CONFIG.MEMBER;

  return (
    <div
      style={styles.personCard}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${member.name}`}
    >
      {/* Top row: avatar + info */}
      <div style={styles.cardTopRow}>
        <div
          style={{
            ...styles.avatar,
            background: member.active ? colors.accentBlue : colors.textMuted,
          }}
        >
          {member.avatar || member.name.charAt(0).toUpperCase()}
        </div>
        <div style={styles.cardTopInfo}>
          <div style={styles.personName}>{member.name}</div>
          {member.title && (
            <div style={styles.personTitle}>{member.title}</div>
          )}
          <div style={styles.personRole}>{member.role}</div>
        </div>
      </div>

      {/* System role badge */}
      <div style={styles.badgeRow}>
        <span
          style={{
            ...styles.roleBadge,
            color: badge.color,
            background: badge.bg,
            border: `1px solid ${badge.color}33`,
          }}
        >
          {systemRole}
        </span>
        <div style={styles.personStatusInline}>
          <div
            style={{
              ...styles.statusDot,
              background: member.active ? colors.accentGreen : colors.textMuted,
            }}
          />
          <span style={styles.statusText}>
            {member.active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Email */}
      {member.email && (
        <a
          href={`mailto:${member.email}`}
          style={styles.personEmail}
          onClick={(e) => e.stopPropagation()}
        >
          {member.email}
        </a>
      )}

      {/* Project access */}
      {projectAccess && projectAccess.length > 0 && (
        <div style={styles.projectAccessSection}>
          <div style={styles.sectionLabel}>Project Access</div>
          <div style={styles.projectChips}>
            {projectAccess.slice(0, 3).map((pa) => {
              const alColor =
                pa.accessLevel === "ADMIN"
                  ? colors.accentRed
                  : pa.accessLevel === "EDIT"
                  ? colors.accentOrange
                  : colors.accentBlue;
              return (
                <span key={pa.projectId} style={styles.projectChip}>
                  <span style={styles.projectChipName}>
                    {getProjectName(pa.projectId)}
                  </span>
                  <span style={{ ...styles.projectChipLevel, color: alColor }}>
                    {pa.accessLevel}
                  </span>
                </span>
              );
            })}
            {projectAccess.length > 3 && (
              <span style={styles.moreChip}>
                +{projectAccess.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Permissions count */}
      {permissions && permissions.length > 0 && (
        <div style={styles.permissionCount}>
          {permissions.length} permission{permissions.length !== 1 ? "s" : ""}{" "}
          granted
        </div>
      )}

      {/* Responsibilities */}
      {member.responsibilities && member.responsibilities.length > 0 && (
        <div style={styles.responsibilities}>
          <div style={styles.sectionLabel}>Responsibilities</div>
          <ul style={styles.responsibilitiesList}>
            {member.responsibilities.slice(0, 3).map((resp, i) => (
              <li key={i} style={styles.responsibilityItem}>
                {resp}
              </li>
            ))}
            {member.responsibilities.length > 3 && (
              <li style={styles.responsibilityItem}>
                +{member.responsibilities.length - 3} more...
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Edit hint */}
      <div style={styles.editHint}>Click to edit</div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    background: colors.bgPage,
    padding: "24px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "20px",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "1rem",
    color: colors.textSecondary,
    marginTop: 0,
  },
  addButton: {
    padding: "10px 20px",
    fontSize: "0.875rem",
    fontWeight: 600,
    background: colors.accentBlue,
    border: "none",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  },
  // Filters
  filterBar: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "24px",
  },
  searchInput: {
    padding: "10px 14px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    outline: "none",
    maxWidth: 420,
  },
  roleFilters: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  filterChip: {
    padding: "5px 14px",
    fontSize: "0.8125rem",
    fontWeight: 500,
    background: "transparent",
    border: `1px solid ${colors.border}`,
    borderRadius: 20,
    color: colors.textSecondary,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  filterChipActive: {
    borderColor: colors.accentBlue,
    color: colors.accentBlue,
    background: "rgba(59, 130, 246, 0.08)",
  },
  // Grid
  peopleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: "16px",
  },
  personCard: {
    padding: "20px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    cursor: "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    position: "relative",
  },
  cardTopRow: {
    display: "flex",
    gap: "16px",
    alignItems: "flex-start",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "1.5rem",
    fontWeight: 600,
    flexShrink: 0,
  },
  cardTopInfo: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "2px",
  },
  personTitle: {
    fontSize: "0.8125rem",
    color: colors.textSecondary,
    marginBottom: "2px",
  },
  personRole: {
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: colors.accentPurple,
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  roleBadge: {
    padding: "3px 10px",
    fontSize: "0.6875rem",
    fontWeight: 700,
    borderRadius: 12,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
  },
  personStatusInline: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  statusText: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  personEmail: {
    fontSize: "0.8125rem",
    color: colors.accentBlue,
    textDecoration: "none",
  },
  // Project access chips
  projectAccessSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingTop: "8px",
    borderTop: `1px solid ${colors.border}`,
  },
  sectionLabel: {
    fontSize: "0.6875rem",
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  projectChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  projectChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "3px 10px",
    background: colors.bgPage,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: "0.75rem",
  },
  projectChipName: {
    color: colors.textSecondary,
  },
  projectChipLevel: {
    fontWeight: 600,
    fontSize: "0.6875rem",
  },
  moreChip: {
    padding: "3px 10px",
    fontSize: "0.75rem",
    color: colors.textMuted,
    background: colors.bgPage,
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
  },
  permissionCount: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  // Responsibilities
  responsibilities: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingTop: "8px",
    borderTop: `1px solid ${colors.border}`,
  },
  responsibilitiesList: {
    marginTop: 0,
    marginBottom: 0,
    paddingLeft: "18px",
  },
  responsibilityItem: {
    fontSize: "0.8125rem",
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
  editHint: {
    position: "absolute",
    bottom: 8,
    right: 12,
    fontSize: "0.6875rem",
    color: colors.textMuted,
    opacity: 0.5,
  },
  // Empty states
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "64px 24px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "4rem",
    marginBottom: "16px",
  },
  emptyTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "8px",
  },
  emptyText: {
    fontSize: "1rem",
    color: colors.textSecondary,
  },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: colors.textSecondary,
    fontSize: "1rem",
  },
};
