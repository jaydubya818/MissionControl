import { Component, type ErrorInfo, type ReactNode } from "react";
import { RuntimeCompatibilityNotice } from "./RuntimeCompatibilityGate";
import { isRuntimeContractError } from "./lib/runtimeCompatibility";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Mission Control render failure", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (isRuntimeContractError(this.state.error)) {
      return <RuntimeCompatibilityNotice technicalDetails={this.state.error.message} />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
        <section
          role="alert"
          className="w-full max-w-xl rounded-xl border border-err/40 bg-surface-1 p-6 shadow-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-err">
            Mission Control could not render
          </p>
          <h1 className="mt-2 text-xl font-semibold">The operator console hit an unexpected error.</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Your persisted work is safe. Reload the console to retry.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-err">
            {this.state.error.message || "Unknown render error"}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-schematic-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Reload Mission Control
          </button>
        </section>
      </main>
    );
  }
}
