import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SchematicPageHead } from "@/components/schematic/SchematicPageHead";
import { SchematicSubTabs } from "@/components/schematic/SchematicSubTabs";
import { DispatchGateBar } from "@/components/schematic/DispatchGateBar";
import { useState } from "react";
import { MemoryView } from "../../MemoryView";

export interface MemoryPillarsViewProps {
  projectId: Id<"projects"> | null;
  onNavigate: (view: string) => void;
}

/** Memory pillars with waku sub-tabs. */
export function MemoryPillarsView({ projectId, onNavigate }: MemoryPillarsViewProps): JSX.Element {
  const [tab, setTab] = useState("overview");
  const stats = useQuery(api.analytics.schematicOverview, projectId ? { projectId } : {});

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "semantic", label: "Semantic", count: stats?.facts },
    { id: "episodic", label: "Episodic", count: stats?.episodeCount },
    { id: "skills", label: "Skills", count: stats?.skillCount },
    { id: "graph", label: "Knowledge graph" },
  ];

  return (
    <div className="pb-6">
      <SchematicPageHead title="Memory" subtitle="three pillars + graph" updatedAt={Date.now()} />
      <SchematicSubTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "overview" ? (
        <>
          <div className="schematic-card border-schematic-accent bg-schematic-accent-soft/40">
            <b className="text-ink">Memory vs Database — two views of one system.</b>
            <p className="schematic-reply mt-2">
              This tab is the curated pillar view. Open{" "}
              <button type="button" className="text-schematic-accent underline" onClick={() => onNavigate("system")}>
                System → Data explorer
              </button>{" "}
              for raw Convex table samples.
            </p>
          </div>
          {stats ? (
            <>
              <h2 className="schematic-section-label mt-6">Retrieval gate</h2>
              <DispatchGateBar autoRouted={stats.gateAuto} gated={stats.gateGated} />
            </>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              ["Semantic", "semantic", `${stats?.facts ?? "—"} facts`, "durable distilled facts"],
              ["Episodic", "episodic", `${stats?.episodeCount ?? "—"} episodes`, "dated run summaries"],
              ["Procedural", "skills", `${stats?.skillCount ?? "—"} skills`, "context packages & SKILL.md"],
            ].map(([title, id, n, desc]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="schematic-card text-left hover:border-schematic-accent"
              >
                <b className="block text-[13px] text-ink">
                  {title}{" "}
                  <span className="schematic-meta font-normal">· {n}</span>
                </b>
                <span className="text-[11.5px] text-ink-secondary">{desc}</span>
              </button>
            ))}
          </div>
        </>
      ) : tab === "graph" ? (
        <MemoryView projectId={projectId} />
      ) : (
        <MemoryView projectId={projectId} />
      )}
    </div>
  );
}
