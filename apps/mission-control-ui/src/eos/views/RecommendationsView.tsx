/**
 * Recommendations — every recommendation carries evidence, confidence, and a
 * drill-down. Fixtures are demo provenance; the generation pipeline itself
 * (friction detectors + effectiveness projections) is Lineage v1 roadmap.
 */

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "../../components/factory/DetailLayout";
import { InsightCard, PageProvenanceNote, ProvenanceBadge } from "../components";
import { demoInsights } from "../demoData";
import { adaptRecommendations } from "../liveAdapters";
import type { Insight } from "../types";

export interface RecommendationsViewProps {
  onNavigate: (view: string) => void;
}

export function RecommendationsView({ onNavigate }: RecommendationsViewProps): JSX.Element {
  const liveRecs = useQuery(api.eos.projections.getRecommendations, {});
  const insights: Insight[] =
    liveRecs && liveRecs.length > 0 ? adaptRecommendations(liveRecs as Insight[]) : demoInsights;
  const provenance = insights[0]?.provenance ?? "demo";

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageHeader
          title="Recommendations"
          description="Every recommendation carries evidence, confidence, and a drill-down."
        />
        <PageProvenanceNote />

        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-1 px-6 py-10 text-center">
          <p className="max-w-[60ch] text-[13px] text-ink-secondary">
            Recommendations are generated from friction detectors and effectiveness projections
            (Lineage v1 roadmap).
          </p>
          <ProvenanceBadge provenance={insights.length > 0 ? provenance : "preview"} />
        </div>
      </div>
    </div>
  );
}
