import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "../../components/factory/DetailLayout";
import {
  EosSection,
  EvidenceLink,
  HealthSignalCard,
  PageProvenanceNote,
  ProvenanceBadge,
  TrendIcon,
} from "../components";
import { demoHealthSignals, demoTraits } from "../demoData";
import { adaptFactoryTraits, adaptHealthSignals } from "../liveAdapters";
import type { FactoryTrait, HealthSignal } from "../types";

export interface FactoryHealthViewProps {
  onNavigate: (view: string) => void;
}

function TraitRow({
  trait,
  onNavigate,
}: {
  trait: FactoryTrait;
  onNavigate: (view: string) => void;
}): JSX.Element {
  const domain = trait.p75 * 1.3;
  const pct = (value: number): number => Math.min(100, Math.max(0, (value / domain) * 100));
  const rangeLeft = pct(trait.p25);
  const rangeWidth = Math.max(pct(trait.p75) - rangeLeft, 0.5);
  const medianLeft = pct(trait.p50);
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-1 p-4 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold text-ink">{trait.label}</span>
            <TrendIcon trend={trait.trend} />
          </div>
          <div className="text-[12.5px] text-ink-muted">{trait.definition}</div>
        </div>
        <ProvenanceBadge provenance={trait.provenance} variant="dot" className="mt-1" />
      </div>
      <div className="relative h-3" aria-hidden>
        <div className="absolute inset-x-0 top-0.5 h-2 rounded-full bg-surface-2" />
        <div
          className="absolute top-0.5 h-2 rounded-full bg-ok/40"
          style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
        />
        <div className="absolute top-0 h-3 w-0.5 bg-ok" style={{ left: `${medianLeft}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[11px] text-ink-muted">
          p25 {trait.p25} · p50 {trait.p50} · p75 {trait.p75} {trait.unit}
        </span>
        <span className="font-mono text-[11px] text-ink-muted">{trait.windowLabel}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2">
        {trait.evidence.map((evidence) => (
          <EvidenceLink key={evidence.label} evidence={evidence} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function FactoryHealthView({ onNavigate }: FactoryHealthViewProps): JSX.Element {
  const liveSignals = useQuery(api.eos.projections.getHealthSignals, {});
  const liveTraits = useQuery(api.eos.projections.getFactoryTraits, {});

  const healthFamilies: HealthSignal[] =
    liveSignals && liveSignals.length > 0
      ? adaptHealthSignals(liveSignals as HealthSignal[])
      : [...demoHealthSignals];
  const traits: FactoryTrait[] =
    liveTraits && liveTraits.length > 0
      ? adaptFactoryTraits(liveTraits)
      : demoTraits;

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <PageHeader title="Factory Health" />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageProvenanceNote />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {healthFamilies.map((signal) => (
            <HealthSignalCard key={signal.id} signal={signal} onNavigate={onNavigate} />
          ))}
        </div>
        <EosSection
          eyebrow="Traits"
          title="Operating characteristics"
          action={<ProvenanceBadge provenance={traits[0]?.provenance ?? "demo"} />}
        >
          <div className="text-[12.5px] text-ink-secondary">
            Quarterly distributions, not scores. p25–p75 ranges with median.
          </div>
          <div className="flex flex-col gap-3">
            {traits.map((trait) => (
              <TraitRow key={trait.id} trait={trait} onNavigate={onNavigate} />
            ))}
          </div>
        </EosSection>
      </div>
    </div>
  );
}
