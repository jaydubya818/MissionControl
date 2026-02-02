import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Mission Control error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#0f172a",
            color: "#e2e8f0",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Something went wrong</h1>
          <pre
            style={{
              padding: 16,
              background: "#1e293b",
              borderRadius: 8,
              overflow: "auto",
              fontSize: "0.875rem",
              color: "#fca5a5",
            }}
          >
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: 16, color: "#94a3b8", fontSize: "0.875rem" }}>
            Check the browser Console (F12 → Console) for details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
