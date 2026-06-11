import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function describeError(error: Error): { title: string; hint: string | null } {
  const message = error.message ?? "";
  if (message.includes("deployment is paused")) {
    return {
      title: "Convex deployment is paused",
      hint: "The backend deployment is paused (plan limits). Resume it in the Convex dashboard, or run a local deployment with `npx convex dev` once the account is restored.",
    };
  }
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return {
      title: "Cannot reach the backend",
      hint: "Check that `npx convex dev` is running and VITE_CONVEX_URL points at it.",
    };
  }
  return { title: "Something went wrong", hint: null };
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in devtools; the UI below is the user-facing report.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { title, hint } = describeError(error);
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#060a14",
          color: "#e2e8f0",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: "100%",
            border: "1px solid #1e293b",
            borderRadius: 12,
            padding: 28,
            background: "#0b1220",
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: "0.18em", color: "#f87171", fontWeight: 700, marginBottom: 8 }}>
            MISSION CONTROL — RUNTIME ERROR
          </div>
          <h1 style={{ fontSize: 20, margin: "0 0 12px", fontWeight: 600 }}>{title}</h1>
          {hint ? (
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8", margin: "0 0 16px" }}>{hint}</p>
          ) : null}
          <pre
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#020617",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: 12,
              color: "#cbd5e1",
              maxHeight: 200,
              overflow: "auto",
              margin: "0 0 20px",
            }}
          >
            {error.message}
          </pre>
          <button
            onClick={() => location.reload()}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#1d4ed8",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
