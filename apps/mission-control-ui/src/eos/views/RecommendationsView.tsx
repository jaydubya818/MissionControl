/**
 * Recommendations — every recommendation carries evidence, confidence, and a
 * drill-down. Fixtures are demo provenance; the generation pipeline itself
 * (friction detectors + effectiveness projections) is Lineage v1 roadmap.
 */

import { PageHeader } from "../../components/factory/DetailLayout";
import { InsightCard, ProvenanceBadge } from "../components";
import { demoInsights } from "../demoData";

export interface RecommendationsViewProps {
  onNavigate: (view: string) => void;
}

export function RecommendationsView({ onNavigate }: RecommendationsViewProps): JSX.Element {
  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <PageHeader
          title="Recommendations"
          description="Every recommendation carries evidence, confidence, and a drill-down."
        />

        <div className="grid gap-4 md:grid-cols-2">
          {demoInsights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-1 px-6 py-10 text-center">
          <p className="max-w-[60ch] text-[13px] text-ink-secondary">
            Recommendations are generated from friction detectors and effectiveness projections
            (Lineage v1 roadmap).
          </p>
          <ProvenanceBadge provenance="preview" />
        </div>
      </div>
    </div>
  );
}
