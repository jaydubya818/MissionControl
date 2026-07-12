import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  KnowledgeGraphPanelContent,
  type KnowledgeGraphSnapshot,
} from "./KnowledgeGraphPanel";

const SNAPSHOT: KnowledgeGraphSnapshot = {
  source: "agentic-kb",
  nodes: [
    {
      externalId: "concept_agent_loop",
      label: "Agent Loop",
      sourceFile: "wiki/concepts/agent-loop.md",
      community: 1,
    },
    {
      externalId: "pattern_supervisor_worker",
      label: "Supervisor Worker",
      sourceFile: "wiki/patterns/pattern-supervisor-worker.md",
      community: 1,
    },
    {
      externalId: "entity_mission_control",
      label: "Mission Control",
      sourceFile: "wiki/entities/mission-control.md",
      community: 2,
    },
  ],
  edges: [
    {
      externalId: "concept_agent_loop->pattern_supervisor_worker:references",
      fromExternalId: "concept_agent_loop",
      toExternalId: "pattern_supervisor_worker",
      relation: "references",
      confidenceScore: 1,
    },
  ],
  hyperedges: [
    {
      externalId: "orchestration_trio",
      label: "Orchestration Trio",
      nodeExternalIds: ["concept_agent_loop", "pattern_supervisor_worker"],
      relation: "collectively_define_orchestration",
    },
  ],
  stats: {
    nodeCount: 3,
    edgeCount: 1,
    hyperedgeCount: 1,
    communities: [1, 2],
  },
};

describe("KnowledgeGraphPanelContent", () => {
  it("renders empty state when snapshot has no nodes", () => {
    render(
      <KnowledgeGraphPanelContent
        snapshot={{
          ...SNAPSHOT,
          nodes: [],
          edges: [],
          hyperedges: [],
          stats: {
            nodeCount: 0,
            edgeCount: 0,
            hyperedgeCount: 0,
            communities: [],
          },
        }}
        neighborhood={null}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("No knowledge graph imported yet")).toBeInTheDocument();
    expect(screen.getByText("pnpm run import:knowledge-graph:demo")).toBeInTheDocument();
  });

  it("renders graph canvas and stats for populated snapshot", () => {
    render(
      <KnowledgeGraphPanelContent
        snapshot={SNAPSHOT}
        neighborhood={null}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Knowledge graph visualization")).toBeInTheDocument();
    expect(screen.getByText("3 / 3 nodes")).toBeInTheDocument();
    expect(screen.getByText("Agent Loop")).toBeInTheDocument();
  });

  it("filters nodes by search text", () => {
    render(
      <KnowledgeGraphPanelContent
        snapshot={SNAPSHOT}
        neighborhood={null}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search graph nodes" }), {
      target: { value: "Mission Control" },
    });
    expect(screen.getByText("1 / 3 nodes")).toBeInTheDocument();
    expect(screen.queryByText("Agent Loop")).not.toBeInTheDocument();
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
  });

  it("shows neighborhood detail when provided", () => {
    render(
      <KnowledgeGraphPanelContent
        snapshot={SNAPSHOT}
        neighborhood={{
          node: SNAPSHOT.nodes[0],
          incidentEdges: SNAPSHOT.edges,
          neighbors: [SNAPSHOT.nodes[1]],
          relatedHyperedges: [
            {
              externalId: "orchestration_trio",
              label: "Orchestration Trio",
              relation: "collectively_define_orchestration",
            },
          ],
        }}
        selectedId="concept_agent_loop"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Agent Loop" })).toBeInTheDocument();
    expect(screen.getByText("Orchestration Trio")).toBeInTheDocument();
    expect(screen.getAllByText("Supervisor Worker").length).toBeGreaterThan(0);
  });
});
