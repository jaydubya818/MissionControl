/**
 * Evidence dossier (Phase 11) — the factory assembles the decision record;
 * the human makes the call. Every section links to underlying evidence,
 * and the whole dossier is labeled demo provenance.
 */

import { PageHeader } from "../../components/factory/DetailLayout";
import { ConfidenceLabel, EvidenceLink, PageProvenanceNote, ProvenanceBadge } from "../components";
import { demoDossier } from "../demoData";
import { cn } from "../../lib/utils";

export interface DossierViewProps {
  onNavigate: (view: string) => void;
}

/** The alternative the factory can actually run as a rollout-rings experiment. */
function isRingScoped(alternative: string): boolean {
  return alternative.includes("rollout rings");
}

export function DossierView({ onNavigate }: DossierViewProps): JSX.Element {
  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageHeader title="Evidence Dossier" description={demoDossier.question} />
        <PageProvenanceNote />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[12.5px] text-ink-secondary">
            <span className="text-ink-muted">Prepared for: </span>
            {demoDossier.preparedFor}
          </span>
          <ConfidenceLabel confidence={demoDossier.confidence} />
          <ProvenanceBadge provenance={demoDossier.provenance} />
        </div>

        <div className="flex flex-col gap-3">
          {demoDossier.evidence.map((section) => (
            <div
              key={section.heading}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4"
            >
              <h3 className="text-[15px] font-semibold text-ink">{section.heading}</h3>
              <p className="text-[13.5px] text-ink-secondary">{section.body}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {section.refs.map((ref) => (
                  <EvidenceLink key={ref.label} evidence={ref} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-[15px] font-semibold text-ink">Assumptions</h3>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-ink-secondary">
              {demoDossier.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
            <h3 className="text-[15px] font-semibold text-ink">Alternatives considered</h3>
            <ol className="flex flex-col gap-2 text-[13px] text-ink-secondary">
              {demoDossier.alternatives.map((alternative, index) => {
                const ringScoped = isRingScoped(alternative);
                return (
                  <li
                    key={alternative}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-2.5",
                      ringScoped ? "border-line-strong" : "border-transparent"
                    )}
                  >
                    <span>
                      <span className="font-mono text-[12px] text-ink-muted">{index + 1}.</span>{" "}
                      {alternative}
                    </span>
                    {ringScoped && (
                      <span className="text-[11.5px] text-ink-muted">
                        the factory can run this experiment for real — rollout rings
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-2 px-6 py-8 text-center">
          <div className="text-[15px] font-semibold text-ink">Human decision required.</div>
          <p className="text-[13px] text-ink-secondary">
            Mission Control assembles the record; it does not make this call.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Preview"
              className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              Export evidence
            </button>
            <button
              type="button"
              title="Preview"
              className="h-9 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink hover:opacity-90"
            >
              Record decision
            </button>
            <ProvenanceBadge provenance="preview" />
          </div>
        </div>
      </div>
    </div>
  );
}
