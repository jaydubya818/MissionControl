import { useState } from "react";
import { useQuery } from "convex/react";
import { DatabaseZap } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SchematicPageHead } from "@/components/schematic/SchematicPageHead";
import { SchematicSubTabs } from "@/components/schematic/SchematicSubTabs";
import { FactoryMemoryContext } from "./factoryMemory/FactoryMemoryContext";
import { FactoryMemoryGraph } from "./factoryMemory/FactoryMemoryGraph";
import { FactoryMemoryOverview } from "./factoryMemory/FactoryMemoryOverview";
import { FactoryMemorySearch } from "./factoryMemory/FactoryMemorySearch";

export interface MemoryPillarsViewProps {
  projectId: Id<"projects"> | null;
  onNavigate: (view: string) => void;
}

type FactoryMemoryTab = "overview" | "memory" | "graph" | "context";

export function MemoryPillarsView({
  projectId,
}: MemoryPillarsViewProps): JSX.Element {
  const [tab, setTab] = useState<FactoryMemoryTab>("overview");
  const overview = useQuery(
    api.factoryMemory.overview,
    projectId ? { projectId } : "skip",
  );
  const hybridEnabled = overview?.phases["factory-memory.hybrid"] ?? false;
  const graphEnabled =
    (overview?.phases["factory-memory.relationships"] ?? false) &&
    (overview?.phases["factory-memory.knowledge-graph"] ?? false);
  const contextEnabled =
    overview?.phases["factory-memory.context-engine"] ?? false;
  const updatedAt = overview?.latestIngestion?.completedAt;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "memory", label: "Memory", count: overview?.indexedDocuments },
    { id: "graph", label: "Graph", count: overview?.relationshipCount },
    {
      id: "context",
      label: "Context",
      count: overview?.contextPackageCount,
    },
  ];

  return (
    <div className="pb-6">
      <SchematicPageHead
        title="Factory Memory"
        subtitle="retrieve · relate · plan · freeze · learn"
        updatedAt={updatedAt}
        live={Boolean(projectId)}
      />
      <SchematicSubTabs
        tabs={tabs}
        active={tab}
        onChange={(next) => setTab(next as FactoryMemoryTab)}
      />

      {!projectId ? (
        <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-1 px-5 py-10 text-center">
          <DatabaseZap className="mx-auto h-7 w-7 text-ink-muted" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-ink">
            Select a workspace
          </h2>
          <p className="mt-1 text-[12px] text-ink-muted">
            Factory Memory never searches across workspace boundaries.
          </p>
        </div>
      ) : tab === "overview" ? (
        <FactoryMemoryOverview overview={overview} />
      ) : tab === "memory" ? (
        <FactoryMemorySearch projectId={projectId} enabled={hybridEnabled} />
      ) : tab === "graph" ? (
        <FactoryMemoryGraph projectId={projectId} enabled={graphEnabled} />
      ) : (
        <FactoryMemoryContext projectId={projectId} enabled={contextEnabled} />
      )}
    </div>
  );
}
