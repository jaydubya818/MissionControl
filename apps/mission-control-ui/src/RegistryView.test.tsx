import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RegistryViewContent, type RegistryEntry } from "./RegistryView";

function entry(overrides: Partial<RegistryEntry>): RegistryEntry {
  return {
    _id: Math.random().toString(36).slice(2),
    slug: "software-factory/example",
    name: "example",
    displayName: null,
    description: "Use this skill when testing the registry.",
    type: "SKILL",
    status: "DRAFT",
    owner: "software-factory",
    tags: ["agent-operations"],
    version: "0.1.0",
    qualityScore: 100,
    reviewAxes: { validation: 100, implementation: 100, activation: 100 },
    impactScore: null,
    securityStatus: "UNSCANNED",
    sourceRepo: "jaydubya818/MissionControl",
    updatedAt: 0,
    ...overrides,
  };
}

const ENTRIES: RegistryEntry[] = [
  entry({ name: "mission-control-heartbeat", qualityScore: 100 }),
  entry({ name: "mission-control-task-lifecycle", qualityScore: 92 }),
  entry({
    name: "architecture-notes",
    type: "DOCUMENTATION",
    qualityScore: 71,
    tags: ["documentation"],
  }),
  entry({ name: "unscored-draft", qualityScore: null }),
];

describe("RegistryViewContent", () => {
  it("renders discover header, categories, and all rows", () => {
    const { container } = render(<RegistryViewContent entries={ENTRIES} />);
    expect(screen.getByRole("heading", { name: "Discover skills" })).toBeInTheDocument();
    expect(screen.getByText("Testing & QA")).toBeInTheDocument();
    expect(screen.getAllByText("mission-control-heartbeat").length).toBeGreaterThan(0);
    expect(screen.getByText("unscored-draft")).toBeInTheDocument();
    expect(container.querySelector(".registry-category-grid")).toBeTruthy();
  });

  it("calls onOpenDetail when a package row is clicked", () => {
    const onOpenDetail = vi.fn();
    render(<RegistryViewContent entries={ENTRIES} onOpenDetail={onOpenDetail} />);
    fireEvent.click(screen.getAllByText("mission-control-heartbeat")[0]);
    expect(onOpenDetail).toHaveBeenCalledWith(
      expect.objectContaining({ name: "mission-control-heartbeat" })
    );
  });

  it("shows top cards only for scored packages", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    expect(screen.getAllByText("mission-control-heartbeat").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("unscored-draft").length).toBe(1);
  });

  it("filters by type tab", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("tab", { name: "Docs" }));
    expect(screen.getAllByText("architecture-notes").length).toBeGreaterThan(0);
    expect(screen.queryByText("mission-control-heartbeat")).not.toBeInTheDocument();
  });

  it("filters by search text", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search skills" }), {
      target: { value: "task-lifecycle" },
    });
    expect(screen.getAllByText("mission-control-task-lifecycle").length).toBeGreaterThan(0);
    expect(screen.queryByText("unscored-draft")).not.toBeInTheDocument();
  });

  it("filters by category card", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Documentation Generation/ }));
    expect(screen.getAllByText("architecture-notes").length).toBeGreaterThan(0);
    expect(screen.queryByText("mission-control-heartbeat")).not.toBeInTheDocument();
  });

  it("opens detail callback when a top card is selected", () => {
    const onOpenDetail = vi.fn();
    render(<RegistryViewContent entries={ENTRIES} onOpenDetail={onOpenDetail} />);
    fireEvent.click(
      screen.getByRole("button", { name: /View details for mission-control-task-lifecycle/i })
    );
    expect(onOpenDetail).toHaveBeenCalledWith(
      expect.objectContaining({ name: "mission-control-task-lifecycle" })
    );
  });

  it("shows loading skeleton when entries are undefined", () => {
    const { container } = render(<RegistryViewContent entries={undefined} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows optimize CTA and switches to evaluate tab", () => {
    const onTabChange = vi.fn();
    render(<RegistryViewContent entries={ENTRIES} onTabChange={onTabChange} />);
    expect(screen.getByText(/Make your skill work correctly, provably/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Optimize with Mission Control/i }));
    expect(onTabChange).toHaveBeenCalledWith("evaluate");
  });

  it("renders Context CDL tab content", () => {
    render(<RegistryViewContent entries={ENTRIES} activeTab="lifecycle" />);
    expect(screen.getByText(/Context Development Lifecycle/)).toBeInTheDocument();
    expect(screen.getByText(/Four problems engineers face in 2026/)).toBeInTheDocument();
  });
});
