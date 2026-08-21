/**
 * Error isolation for the content region.
 *
 * ## Why this exists
 *
 * Mission Control had exactly one error boundary, in `main.tsx`, wrapping the
 * entire application. A render error anywhere in any of the ~250 views —
 * including one caused by a single malformed record — replaced the whole
 * console with a full-page "could not render" screen: no sidebar, no
 * navigation, no way to reach a different view, and recovery only by reloading.
 *
 * That is the wrong failure mode for a control plane. The console is the tool
 * an operator reaches for *during* an incident, and the incident is exactly
 * when a bad record is most likely to be present. A broken Approvals view must
 * not take the Work Orders view down with it.
 *
 * This boundary wraps only the routed content region, so the shell survives and
 * the operator can navigate away. It is keyed by route: React discards a
 * boundary's error state when its `key` changes, so navigating to any other
 * view clears the error without a reload.
 *
 * Runtime-contract errors are deliberately NOT handled here — those mean the
 * client and deployment disagree about the API surface, which is a whole-app
 * condition. They are re-thrown to the root boundary, which renders the
 * upgrade notice.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { isRuntimeContractError } from "./lib/runtimeCompatibility";

interface Props {
  /** Current route. Changing it resets the boundary. */
  viewKey: string;
  onNavigateHome?: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Mission Control view "${this.props.viewKey}" failed to render`,
      error,
      info.componentStack,
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Whole-app condition: let the root boundary render the upgrade notice.
    if (isRuntimeContractError(error)) throw error;

    return (
      <div className="flex flex-1 items-start justify-center overflow-auto bg-app p-6">
        <section
          role="alert"
          className="w-full max-w-2xl rounded-xl border border-err/40 bg-surface-1 p-6"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-err">
            This view failed to render
          </p>
          <h1 className="mt-2 text-[18px] font-semibold text-ink">
            Mission Control could not display “{this.props.viewKey}”.
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-secondary">
            The rest of the console is unaffected — navigation, other views, and any work already
            recorded are intact. Nothing was changed by this failure.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-err">
            {error.message || "Unknown render error"}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="h-9 rounded-lg border border-line-control px-3 text-[13px] font-medium text-ink"
            >
              Retry this view
            </button>
            {this.props.onNavigateHome && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onNavigateHome?.();
                }}
                className="h-9 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink"
              >
                Go to Home
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }
}
