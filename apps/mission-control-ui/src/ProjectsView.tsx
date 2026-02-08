import { CSSProperties, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface ProjectsViewProps {
  projectId: Id<"projects"> | null;
}

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
  accentOrange: "#f59e0b",
  accentPurple: "#8b5cf6",
  accentRed: "#ef4444",
};

export function ProjectsView({ projectId }: ProjectsViewProps) {
  const projects = useQuery(api.projects.list);
  const [selectedProject, setSelectedProject] = useState<Id<"projects"> | null>(
    projectId
  );

  // Sync selectedProject with projectId prop changes
  if (projectId !== selectedProject && projectId !== null) {
    setSelectedProject(projectId);
  }

  if (!projects) {
    return (
      <main style={styles.container}>
        <div style={styles.loading}>Loading projects...</div>
      </main>
    );
  }

  return (
    <main style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Projects</h1>
        <p style={styles.subtitle}>
          Manage repositories and agent swarms
        </p>
      </div>

      <div style={styles.projectsGrid}>
        {projects.map((project) => (
          <ProjectCard
            key={project._id}
            project={project}
            isSelected={project._id === selectedProject}
            onSelect={() => setSelectedProject(project._id)}
          />
        ))}
      </div>

      {selectedProject && (
        <ProjectDetails projectId={selectedProject} />
      )}
    </main>
  );
}

interface ProjectCardProps {
  project: Doc<"projects">;
  isSelected: boolean;
  onSelect: () => void;
}

function ProjectCard({ project, isSelected, onSelect }: ProjectCardProps) {
  const stats = useQuery(api.projects.getStats, { projectId: project._id });
  const agents = useQuery(api.agents.list, { projectId: project._id });

  const activeAgents = agents?.filter((a) => a.status === "ACTIVE").length ?? 0;

  return (
    <button
      onClick={onSelect}
      style={{
        ...styles.projectCard,
        ...(isSelected && styles.projectCardSelected),
      }}
      aria-label={`Project: ${project.name}`}
    >
      <div style={styles.projectHeader}>
        <div style={styles.projectIcon}>📁</div>
        <div style={styles.projectInfo}>
          <div style={styles.projectName}>{project.name}</div>
          {project.githubRepo && (
            <div style={styles.projectRepo}>
              <span style={styles.githubIcon}>⚡</span>
              {project.githubRepo}
            </div>
          )}
        </div>
      </div>

      {project.description && (
        <div style={styles.projectDesc}>{project.description}</div>
      )}

      <div style={styles.projectStats}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{stats?.tasks.total ?? 0}</span>
          <span style={styles.statLabel}>Tasks</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>
            {activeAgents}/{agents?.length ?? 0}
          </span>
          <span style={styles.statLabel}>Agents</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{stats?.approvals.pending ?? 0}</span>
          <span style={styles.statLabel}>Approvals</span>
        </div>
      </div>

      {project.swarmConfig && (
        <div style={styles.swarmBadge}>
          🤖 Swarm: {project.swarmConfig.maxAgents} max
          {project.swarmConfig.autoScale && " • Auto-scale"}
        </div>
      )}
    </button>
  );
}

interface ProjectDetailsProps {
  projectId: Id<"projects">;
}

function ProjectDetails({ projectId }: ProjectDetailsProps) {
  const project = useQuery(api.projects.get, { projectId });
  const agents = useQuery(api.agents.list, { projectId });

  if (!project) return null;

  const activeAgents = agents?.filter((a) => a.status === "ACTIVE") ?? [];
  const pausedAgents = agents?.filter((a) => a.status === "PAUSED") ?? [];

  return (
    <div style={styles.detailsSection}>
      <h2 style={styles.detailsTitle}>Agent Swarm Configuration</h2>

      <div style={styles.detailsGrid}>
        <div style={styles.detailCard}>
          <div style={styles.detailCardTitle}>Active Agents</div>
          <div style={styles.agentList}>
            {activeAgents.length === 0 && (
              <div style={styles.emptyState}>No active agents</div>
            )}
            {activeAgents.map((agent) => (
              <AgentBadge key={agent._id} agent={agent} />
            ))}
          </div>
        </div>

        <div style={styles.detailCard}>
          <div style={styles.detailCardTitle}>Paused Agents</div>
          <div style={styles.agentList}>
            {pausedAgents.length === 0 && (
              <div style={styles.emptyState}>No paused agents</div>
            )}
            {pausedAgents.map((agent) => (
              <AgentBadge key={agent._id} agent={agent} />
            ))}
          </div>
        </div>

        <div style={styles.detailCard}>
          <div style={styles.detailCardTitle}>GitHub Integration</div>
          <div style={styles.githubInfo}>
            {project.githubRepo ? (
              <>
                <div style={styles.githubRow}>
                  <span style={styles.githubLabel}>Repository:</span>
                  <span style={styles.githubValue}>{project.githubRepo}</span>
                </div>
                <div style={styles.githubRow}>
                  <span style={styles.githubLabel}>Branch:</span>
                  <span style={styles.githubValue}>
                    {project.githubBranch || "main"}
                  </span>
                </div>
                <div style={styles.githubRow}>
                  <span style={styles.githubLabel}>Webhook:</span>
                  <span style={styles.githubValue}>
                    {project.githubWebhookSecret ? "✓ Configured" : "✗ Not set"}
                  </span>
                </div>
              </>
            ) : (
              <div style={styles.emptyState}>Not connected to GitHub</div>
            )}
          </div>
        </div>

        <div style={styles.detailCard}>
          <div style={styles.detailCardTitle}>Swarm Settings</div>
          <div style={styles.swarmSettings}>
            {project.swarmConfig ? (
              <>
                <div style={styles.settingRow}>
                  <span style={styles.settingLabel}>Max Agents:</span>
                  <span style={styles.settingValue}>
                    {project.swarmConfig.maxAgents}
                  </span>
                </div>
                <div style={styles.settingRow}>
                  <span style={styles.settingLabel}>Default Model:</span>
                  <span style={styles.settingValue}>
                    {project.swarmConfig.defaultModel || "Claude Sonnet 4"}
                  </span>
                </div>
                <div style={styles.settingRow}>
                  <span style={styles.settingLabel}>Auto-scale:</span>
                  <span style={styles.settingValue}>
                    {project.swarmConfig.autoScale ? "✓ Enabled" : "✗ Disabled"}
                  </span>
                </div>
              </>
            ) : (
              <div style={styles.emptyState}>No swarm configuration</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AgentBadgeProps {
  agent: Doc<"agents">;
}

function AgentBadge({ agent }: AgentBadgeProps) {
  let statusColor = colors.accentGreen;
  if (agent.status === "PAUSED") statusColor = colors.accentOrange;
  else if (agent.status === "QUARANTINED") statusColor = colors.accentRed;
  else if (agent.status === "OFFLINE") statusColor = colors.textMuted;

  return (
    <div style={styles.agentBadge}>
      <div
        style={{
          ...styles.agentBadgeIcon,
          background: statusColor,
        }}
      >
        {agent.emoji || agent.name.charAt(0).toUpperCase()}
      </div>
      <div style={styles.agentBadgeInfo}>
        <div style={styles.agentBadgeName}>{agent.name}</div>
        <div style={styles.agentBadgeRole}>{agent.role}</div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    background: colors.bgPage,
    padding: "24px",
  },
  header: {
    marginBottom: "24px",
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
  projectsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  },
  projectCard: {
    padding: "20px",
    background: colors.bgCard,
    border: `2px solid ${colors.border}`,
    borderRadius: 10,
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left",
  },
  projectCardSelected: {
    borderColor: colors.accentBlue,
    boxShadow: `0 0 0 2px ${colors.accentBlue}40`,
  },
  projectHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  projectIcon: {
    fontSize: "2rem",
  },
  projectInfo: {
    flex: 1,
    minWidth: 0,
  },
  projectName: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "4px",
  },
  projectRepo: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "0.875rem",
    color: colors.textSecondary,
  },
  githubIcon: {
    fontSize: "0.875rem",
  },
  projectDesc: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: "16px",
  },
  projectStats: {
    display: "flex",
    gap: "16px",
    paddingTop: "12px",
    borderTop: `1px solid ${colors.border}`,
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statValue: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  swarmBadge: {
    marginTop: "12px",
    padding: "8px 12px",
    background: colors.bgHover,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  detailsSection: {
    marginTop: "32px",
    paddingTop: "32px",
    borderTop: `2px solid ${colors.border}`,
  },
  detailsTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "20px",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "16px",
  },
  detailCard: {
    padding: "16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  detailCardTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "12px",
  },
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  agentBadge: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px",
    background: colors.bgHover,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
  },
  agentBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "0.875rem",
    fontWeight: 600,
    flexShrink: 0,
  },
  agentBadgeInfo: {
    flex: 1,
    minWidth: 0,
  },
  agentBadgeName: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: colors.textPrimary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  agentBadgeRole: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  githubInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  githubRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  githubLabel: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
  },
  githubValue: {
    fontSize: "0.875rem",
    color: colors.textPrimary,
    fontWeight: 500,
  },
  swarmSettings: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  settingRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
  },
  settingLabel: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
  },
  settingValue: {
    fontSize: "0.875rem",
    color: colors.textPrimary,
    fontWeight: 500,
  },
  emptyState: {
    fontSize: "0.875rem",
    color: colors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    padding: "12px",
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
