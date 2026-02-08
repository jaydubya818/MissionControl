import { CSSProperties, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface CapturesViewProps {
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
};

type CaptureType = "all" | "SCREENSHOT" | "DIAGRAM" | "MOCKUP" | "CHART" | "VIDEO" | "OTHER";

export function CapturesView({ projectId }: CapturesViewProps) {
  const [filterType, setFilterType] = useState<CaptureType>("all");
  const captures = useQuery(api.captures.list, {
    projectId: projectId ?? undefined,
    type: filterType === "all" ? undefined : filterType,
  });

  // Handle loading state
  if (captures === undefined) {
    return (
      <main style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Captures</h1>
          <p style={styles.subtitle}>Loading...</p>
        </div>
      </main>
    );
  }

  const typeColors: Record<string, string> = {
    SCREENSHOT: colors.accentBlue,
    DIAGRAM: colors.accentPurple,
    MOCKUP: colors.accentGreen,
    CHART: colors.accentOrange,
    VIDEO: colors.accentPurple,
    OTHER: colors.textMuted,
  };

  return (
    <main style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Captures</h1>
        <p style={styles.subtitle}>Visual artifacts and deliverables gallery</p>
      </div>

      <div style={styles.filters}>
        <button
          onClick={() => setFilterType("all")}
          style={{
            ...styles.filterButton,
            ...(filterType === "all" && styles.filterButtonActive),
          }}
        >
          All
        </button>
        <button
          onClick={() => setFilterType("SCREENSHOT")}
          style={{
            ...styles.filterButton,
            ...(filterType === "SCREENSHOT" && styles.filterButtonActive),
          }}
        >
          Screenshots
        </button>
        <button
          onClick={() => setFilterType("DIAGRAM")}
          style={{
            ...styles.filterButton,
            ...(filterType === "DIAGRAM" && styles.filterButtonActive),
          }}
        >
          Diagrams
        </button>
        <button
          onClick={() => setFilterType("MOCKUP")}
          style={{
            ...styles.filterButton,
            ...(filterType === "MOCKUP" && styles.filterButtonActive),
          }}
        >
          Mockups
        </button>
        <button
          onClick={() => setFilterType("CHART")}
          style={{
            ...styles.filterButton,
            ...(filterType === "CHART" && styles.filterButtonActive),
          }}
        >
          Charts
        </button>
        <button
          onClick={() => setFilterType("VIDEO")}
          style={{
            ...styles.filterButton,
            ...(filterType === "VIDEO" && styles.filterButtonActive),
          }}
        >
          Videos
        </button>
        <button
          onClick={() => setFilterType("OTHER")}
          style={{
            ...styles.filterButton,
            ...(filterType === "OTHER" && styles.filterButtonActive),
          }}
        >
          Other
        </button>
      </div>

      <div style={styles.gallery}>
        {captures?.map((capture) => (
          <CaptureCard
            key={capture._id}
            capture={capture}
            typeColor={typeColors[capture.type]}
          />
        ))}
      </div>

      {captures?.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📸</div>
          <div style={styles.emptyTitle}>No captures yet</div>
          <div style={styles.emptyText}>
            Visual artifacts will appear here as agents complete tasks
          </div>
        </div>
      )}
    </main>
  );
}

interface CaptureCardProps {
  capture: Doc<"captures">;
  typeColor: string;
}

function CaptureCard({ capture, typeColor }: CaptureCardProps) {
  return (
    <div style={styles.captureCard}>
      <div
        style={{
          ...styles.captureThumbnail,
          background: capture.thumbnailUrl
            ? `url(${capture.thumbnailUrl}) center/cover`
            : colors.bgHover,
        }}
      >
        {!capture.thumbnailUrl && (
          <div style={styles.capturePlaceholder}>
            {capture.type === "SCREENSHOT" && "📷"}
            {capture.type === "DIAGRAM" && "📊"}
            {capture.type === "MOCKUP" && "🎨"}
            {capture.type === "CHART" && "📈"}
            {capture.type === "VIDEO" && "🎥"}
            {capture.type === "OTHER" && "📄"}
          </div>
        )}
      </div>

      <div style={styles.captureInfo}>
        <div style={styles.captureTitle}>{capture.title}</div>
        {capture.description && (
          <div style={styles.captureDesc}>{capture.description}</div>
        )}
        <div style={styles.captureMeta}>
          <span
            style={{
              ...styles.captureType,
              background: typeColor,
            }}
          >
            {capture.type}
          </span>
          <span style={styles.captureTime}>
            {new Date(capture.capturedAt).toLocaleDateString()}
          </span>
        </div>
        {capture.tags && capture.tags.length > 0 && (
          <div style={styles.captureTags}>
            {capture.tags.map((tag, i) => (
              <span key={i} style={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
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
  filters: {
    display: "flex",
    gap: "8px",
    marginBottom: "24px",
    flexWrap: "wrap",
  },
  filterButton: {
    padding: "8px 16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  filterButtonActive: {
    background: colors.accentBlue,
    borderColor: colors.accentBlue,
    color: "#fff",
  },
  gallery: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  captureCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    overflow: "hidden",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  captureThumbnail: {
    width: "100%",
    height: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  capturePlaceholder: {
    fontSize: "3rem",
  },
  captureInfo: {
    padding: "16px",
  },
  captureTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "6px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  captureDesc: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
    lineHeight: 1.4,
    marginBottom: "8px",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  captureMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
  },
  captureType: {
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#fff",
  },
  captureTime: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  captureTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  tag: {
    padding: "4px 8px",
    background: colors.bgHover,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
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
};
