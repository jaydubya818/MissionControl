import { describe, expect, it } from "vitest";
import {
  buildEdgeExternalId,
  getNeighborhoodForNode,
  normalizeGraphifyPayload,
  summarizeSnapshot,
} from "../lib/knowledgeGraph";

const SAMPLE_PAYLOAD = {
  nodes: [
    {
      id: "concept_agent_loop",
      label: "Agent Loop",
      file_type: "document",
      source_file: "wiki/concepts/agent-loop.md",
      community: 2,
    },
    {
      id: "pattern_supervisor_worker",
      label: "Supervisor-Worker",
      file_type: "document",
      source_file: "wiki/patterns/pattern-supervisor-worker.md",
      community: 2,
    },
  ],
  links: [
    {
      source: "concept_agent_loop",
      target: "pattern_supervisor_worker",
      relation: "references",
      confidence: "EXTRACTED",
      confidence_score: 1,
      source_file: "wiki/concepts/agent-loop.md",
    },
  ],
  graph: {
    hyperedges: [
      {
        id: "orchestration_trio",
        label: "Orchestration Trio",
        nodes: ["concept_agent_loop", "pattern_supervisor_worker"],
        relation: "collectively_define_orchestration",
        confidence: "INFERRED",
        confidence_score: 0.9,
      },
    ],
  },
};

describe("normalizeGraphifyPayload", () => {
  it("normalizes nodes, links, and nested hyperedges", () => {
    const snapshot = normalizeGraphifyPayload(SAMPLE_PAYLOAD);
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.edges).toHaveLength(1);
    expect(snapshot.hyperedges).toHaveLength(1);
    expect(snapshot.nodes[0]).toMatchObject({
      externalId: "concept_agent_loop",
      label: "Agent Loop",
      community: 2,
    });
    expect(snapshot.edges[0]).toMatchObject({
      fromExternalId: "concept_agent_loop",
      toExternalId: "pattern_supervisor_worker",
      relation: "references",
      confidenceScore: 1,
    });
    expect(snapshot.hyperedges[0]).toMatchObject({
      externalId: "orchestration_trio",
      nodeExternalIds: ["concept_agent_loop", "pattern_supervisor_worker"],
    });
  });

  it("falls back to _src/_tgt when source/target missing", () => {
    const snapshot = normalizeGraphifyPayload({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      links: [{ _src: "a", _tgt: "b", relation: "related" }],
    });
    expect(snapshot.edges[0]).toMatchObject({
      fromExternalId: "a",
      toExternalId: "b",
      externalId: buildEdgeExternalId("a", "b", "related"),
    });
  });

  it("returns empty snapshot for missing payload", () => {
    const snapshot = normalizeGraphifyPayload({});
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.edges).toEqual([]);
    expect(snapshot.hyperedges).toEqual([]);
  });

  it("dedupes hyperedges listed in both top-level and graph.hyperedges", () => {
    const duplicate = {
      id: "orchestration_trio",
      label: "Orchestration Trio",
      nodes: ["concept_agent_loop", "pattern_supervisor_worker"],
      relation: "collectively_define_orchestration",
    };
    const snapshot = normalizeGraphifyPayload({
      nodes: SAMPLE_PAYLOAD.nodes,
      hyperedges: [duplicate],
      graph: { hyperedges: [duplicate] },
    });
    expect(snapshot.hyperedges).toHaveLength(1);
  });
});

describe("summarizeSnapshot", () => {
  it("counts nodes, edges, hyperedges, and communities", () => {
    const snapshot = normalizeGraphifyPayload(SAMPLE_PAYLOAD);
    expect(summarizeSnapshot(snapshot)).toEqual({
      nodeCount: 2,
      edgeCount: 1,
      hyperedgeCount: 1,
      communities: [2],
    });
  });
});

describe("getNeighborhoodForNode", () => {
  it("returns incident edges, neighbors, and related hyperedges", () => {
    const snapshot = normalizeGraphifyPayload(SAMPLE_PAYLOAD);
    const neighborhood = getNeighborhoodForNode("concept_agent_loop", snapshot);
    expect(neighborhood).not.toBeNull();
    expect(neighborhood?.incidentEdges).toHaveLength(1);
    expect(neighborhood?.neighbors).toHaveLength(1);
    expect(neighborhood?.relatedHyperedges).toHaveLength(1);
  });

  it("returns null for unknown node", () => {
    const snapshot = normalizeGraphifyPayload(SAMPLE_PAYLOAD);
    expect(getNeighborhoodForNode("missing", snapshot)).toBeNull();
  });
});
