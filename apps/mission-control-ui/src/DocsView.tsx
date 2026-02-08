import { CSSProperties } from "react";

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
};

export function DocsView() {
  const docLinks = [
    { title: "PRD V2", path: "docs/PRD_V2.md", icon: "📋" },
    { title: "App Flow", path: "docs/APP_FLOW.md", icon: "🔄" },
    { title: "Backend Structure", path: "docs/BACKEND_STRUCTURE.md", icon: "🏗️" },
    { title: "Frontend Guidelines", path: "docs/FRONTEND_GUIDELINES.md", icon: "🎨" },
    { title: "Tech Stack", path: "docs/TECH_STACK.md", icon: "⚙️" },
    { title: "Quick Start", path: "docs/guides/QUICK_START_NOW.md", icon: "🚀" },
    { title: "Runbook", path: "docs/runbook/RUNBOOK.md", icon: "📖" },
    { title: "Implementation Plan", path: "docs/planning/IMPLEMENTATION_PLAN.md", icon: "📝" },
  ];

  return (
    <main style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Documentation</h1>
        <p style={styles.subtitle}>Project guides and technical references</p>
      </div>

      <div style={styles.docGrid}>
        {docLinks.map((doc) => (
          <a
            key={doc.path}
            href={`/${doc.path}`}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.docCard}
          >
            <div style={styles.docIcon}>{doc.icon}</div>
            <div style={styles.docInfo}>
              <div style={styles.docTitle}>{doc.title}</div>
              <div style={styles.docPath}>{doc.path}</div>
            </div>
            <div style={styles.docArrow}>→</div>
          </a>
        ))}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Links</h2>
        <div style={styles.linkList}>
          {/* TODO: Replace with actual project-specific URLs */}
          <a
            href="https://github.com/jaydubya818/MissionControl"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            <span>GitHub Repository</span>
            <span>↗</span>
          </a>
          <a
            href="https://convex.dev"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            <span>Convex Dashboard</span>
            <span>↗</span>
          </a>
          <a
            href="https://notion.so"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            <span>Notion Workspace</span>
            <span>↗</span>
          </a>
        </div>
      </div>
    </main>
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
  docGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  },
  docCard: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "20px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    textDecoration: "none",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  docIcon: {
    fontSize: "2rem",
    flexShrink: 0,
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "4px",
  },
  docPath: {
    fontSize: "0.75rem",
    color: colors.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  docArrow: {
    fontSize: "1.5rem",
    color: colors.textMuted,
    flexShrink: 0,
  },
  section: {
    marginTop: "32px",
  },
  sectionTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "16px",
  },
  linkList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  link: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.textPrimary,
    textDecoration: "none",
    fontSize: "0.875rem",
    fontWeight: 500,
    transition: "all 0.2s",
  },
};
