import { useState } from "react";
import { SchematicSubTabs } from "@/components/schematic/SchematicSubTabs";
import { TraceInspectorView, type TraceInspectorViewProps } from "./TraceInspectorView";
import { LoopInspectorView } from "./LoopInspectorView";
import type { Id } from "../../../../../convex/_generated/dataModel";

export interface ExecutionInspectorViewProps extends TraceInspectorViewProps {
  projectId?: Id<"projects"> | null;
}

/** Execution surface with Trace + Loop sub-tabs (waku loop vs detail). */
export function ExecutionInspectorView({
  onNavigate,
  projectId,
}: ExecutionInspectorViewProps): JSX.Element {
  const [tab, setTab] = useState("trace");

  return (
    <div>
      <SchematicSubTabs
        tabs={[
          { id: "trace", label: "Trace" },
          { id: "loop", label: "Loop" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "loop" ? (
        <LoopInspectorView projectId={projectId} onNavigate={onNavigate} />
      ) : (
        <TraceInspectorView onNavigate={onNavigate} />
      )}
    </div>
  );
}
