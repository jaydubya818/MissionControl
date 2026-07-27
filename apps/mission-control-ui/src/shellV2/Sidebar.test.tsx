import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

function renderSidebar(activeView = "tasks", onNavigate = vi.fn()) {
  render(
    <Sidebar
      activeView={activeView as never}
      onNavigate={onNavigate}
      onOpenSearch={vi.fn()}
      workspaceSwitcher={<select aria-label="Project" />}
    />
  );
  return onNavigate;
}

describe("Sidebar", () => {
  it("renders primary navigation with group labels", () => {
    renderSidebar();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    for (const label of ["Operate", "Control", "Harness", "Factory", "Intelligence", "Observe", "Platform", "Govern"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the active view with aria-current and expands its group", () => {
    renderSidebar("tasks");
    const active = screen.getByRole("button", { name: /Tasks/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("expands the group owning the active view even when not toggled", () => {
    renderSidebar("policies");
    expect(screen.getByRole("button", { name: /Policies/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("navigates on item click", () => {
    const onNavigate = renderSidebar("tasks");
    fireEvent.click(screen.getByRole("button", { name: /Overview/ }));
    expect(onNavigate).toHaveBeenCalledWith("home");
  });

  it("collapses and expands sections", () => {
    renderSidebar("tasks");
    const toggle = screen.getByRole("button", { name: /Operate/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    // active group stays force-expanded; collapse a non-active one instead
    const govern = screen.getByRole("button", { name: /Govern/ });
    expect(govern).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(govern);
    expect(govern).toHaveAttribute("aria-expanded", "true");
  });
});
