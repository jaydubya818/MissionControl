import { Component, type ReactNode } from "react";
import { Button } from "../components/ui/button";

/** A denied Preview query must not replace the surrounding operator console. */
export class FactoryPreviewBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <div role="alert" className="mt-3 space-y-2 rounded-md border border-line p-3 text-xs text-ink-secondary">
      <p>{this.props.label} is currently unavailable. Check your authenticated workspace access or retry the read.</p>
      <details><summary className="cursor-pointer">View reason</summary><p className="mt-2 break-words">{this.state.error.message.slice(0, 1000)}</p></details>
      <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>Retry {this.props.label.toLowerCase()}</Button>
    </div>;
  }
}
