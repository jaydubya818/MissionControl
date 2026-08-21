import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Boom({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  cleanup();
});

describe("RouteErrorBoundary", () => {
  it("contains a view failure and names the view, without unmounting the shell", () => {
    render(
      <div>
        <nav>shell navigation</nav>
        <RouteErrorBoundary viewKey="approvals">
          <Boom message="Cannot read properties of undefined (reading 'status')" />
        </RouteErrorBoundary>
      </div>,
    );
    // The shell is still on screen — the whole point.
    expect(screen.getByText("shell navigation")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("approvals");
    expect(screen.getByRole("alert").textContent).toContain(
      "Cannot read properties of undefined",
    );
  });

  it("re-throws runtime-contract errors so the root boundary handles them", () => {
    // A contract mismatch is an app-wide condition, not a per-view one.
    expect(() =>
      render(
        <RouteErrorBoundary viewKey="work-orders">
          <Boom message="Could not find public function for 'approvals:pendingSummaryV2'" />
        </RouteErrorBoundary>,
      ),
    ).toThrow(/Could not find public function/);
  });
});
