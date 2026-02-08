import { CSSProperties } from "react";

export type MainView =
  | "tasks"
  | "agents"
  | "dag"
  | "chat"
  | "council"
  | "calendar"
  | "projects"
  | "memory"
  | "captures"
  | "docs"
  | "people"
  | "org"
  | "office"
  | "search";

interface TopNavProps {
  currentView: MainView;
  onViewChange: (view: MainView) => void;
}

interface NavItem {
  id: MainView;
  label: string;
  icon: string;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { id: "tasks", label: "Tasks", icon: "📋", shortcut: "1" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "dag", label: "DAG", icon: "🔀" },
  { id: "chat", label: "Chat", icon: "💬", shortcut: "2" },
  { id: "council", label: "Council", icon: "🏛️", shortcut: "3" },
  { id: "calendar", label: "Calendar", icon: "📅", shortcut: "4" },
  { id: "projects", label: "Projects", icon: "📁", shortcut: "5" },
  { id: "memory", label: "Memory", icon: "🧠", shortcut: "6" },
  { id: "captures", label: "Captures", icon: "📸", shortcut: "7" },
  { id: "docs", label: "Docs", icon: "📚", shortcut: "8" },
  { id: "people", label: "People", icon: "👥", shortcut: "9" },
  { id: "org", label: "Org", icon: "🏢", shortcut: "0" },
  { id: "office", label: "Office", icon: "🏠" },
  { id: "search", label: "Search", icon: "🔍" },
];

const colors = {
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
};

export function TopNav({ currentView, onViewChange }: TopNavProps) {
  return (
    <nav style={styles.nav} role="navigation" aria-label="Main navigation">
      <div style={styles.container}>
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              style={{
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              }}
              aria-label={`Navigate to ${item.label}`}
              aria-current={isActive ? "page" : undefined}
              title={item.shortcut ? `${item.label} (Cmd+${item.shortcut})` : item.label}
            >
              <span style={styles.icon}>{item.icon}</span>
              <span style={styles.label}>{item.label}</span>
              {isActive && <div style={styles.activeIndicator} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const styles: Record<string, CSSProperties> = {
  nav: {
    background: colors.bgCard,
    borderBottom: `1px solid ${colors.border}`,
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  container: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "0 16px",
    overflowX: "auto",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    color: colors.textSecondary,
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    position: "relative",
    transition: "color 0.15s, background 0.15s",
    whiteSpace: "nowrap",
  },
  navItemActive: {
    color: colors.textPrimary,
  },
  icon: {
    fontSize: "1.1rem",
    lineHeight: 1,
  },
  label: {
    lineHeight: 1,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "2px",
    background: colors.accentBlue,
  },
};
