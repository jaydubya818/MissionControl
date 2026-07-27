import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { SchematicPageHead } from "@/components/schematic/SchematicPageHead";
import { SchematicSubTabs } from "@/components/schematic/SchematicSubTabs";
import { SchemaTable } from "@/components/schematic/SchemaTable";

export interface DataExplorerViewProps {
  projectId?: Id<"projects"> | null;
}

/** Convex table explorer (waku Database tab). */
export function DataExplorerView({ projectId }: DataExplorerViewProps): JSX.Element {
  const tables = useQuery(api.analytics.dataExplorerTables, projectId ? { projectId } : {});
  const [active, setActive] = useState("tasks");

  const tabs =
    tables?.map((t) => ({
      id: t.id,
      label: t.label,
      count: t.sample.count,
    })) ?? [];

  const current = tables?.find((t) => t.id === active) ?? tables?.[0];

  return (
    <div className="pb-6">
      <SchematicPageHead title="Database" subtitle="Convex tables · read-only samples" updatedAt={Date.now()} />
      <p className="mb-4 text-[13px] text-ink-secondary">
        Schema-aligned table browser over Mission Control&apos;s Convex database. Samples are
        read-only — use Convex dashboard for mutations.
      </p>
      {tables === undefined ? (
        <div className="schematic-card animate-pulse text-ink-muted">Loading tables…</div>
      ) : (
        <>
          <SchematicSubTabs tabs={tabs} active={active} onChange={setActive} />
          {current ? (
            <>
              <p className="schematic-meta mb-3">{current.description}</p>
              <SchemaTable
                columns={current.sample.columns}
                rows={current.sample.rows}
                count={current.sample.count}
                sampleSize={current.sample.rows.length}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
