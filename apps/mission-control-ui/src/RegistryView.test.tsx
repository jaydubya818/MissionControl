import { describe, expect, it } from "vitest";
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
  it("renders header, categories, and all rows", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    expect(screen.getByRole("heading", { name: "Registry" })).toBeInTheDocument();
    expect(screen.getByText("Testing & Quality")).toBeInTheDocument();
    expect(screen.getAllByText("mission-control-heartbeat").length).toBeGreaterThan(0);
    expect(screen.getByText("unscored-draft")).toBeInTheDocument();
  });

  it("shows top cards only for scored packages", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    // top cards + table rows both render the name; unscored only in table
    expect(screen.getAllByText("mission-control-heartbeat").length).toBe(2);
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
    fireEvent.change(screen.getByRole("searchbox", { name: "Search packages" }), {
      target: { value: "task-lifecycle" },
    });
    expect(screen.getAllByText("mission-control-task-lifecycle").length).toBeGreaterThan(0);
    expect(screen.queryByText("unscored-draft")).not.toBeInTheDocument();
  });

  it("filters by category chip", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Documentation/ }));
    expect(screen.getAllByText("architecture-notes").length).toBeGreaterThan(0);
    expect(screen.queryByText("mission-control-heartbeat")).not.toBeInTheDocument();
  });

  it("shows loading skeleton when entries are undefined", () => {
    const { container } = render(<RegistryViewContent entries={undefined} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("points operators to the Evals tab for impact scores", () => {
    render(<RegistryViewContent entries={ENTRIES} />);
    expect(screen.getByText(/Run evals from the Evals tab/)).toBeInTheDocument();
  });
});
