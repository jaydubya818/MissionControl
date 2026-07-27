import { DEMO_REPETITIVE_FINDINGS } from "@/lib/harnessWorkshop";
import { FileSearch, Lightbulb } from "lucide-react";

export function HarnessRepetitiveTasksPanel({
  onProposeRule,
}: {
  onProposeRule?: (rule: string) => void;
}): JSX.Element {
  return (
    <section className="registry-eval-card space-y-4">
      <div className="flex items-start gap-3">
        <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-registry-accent" aria-hidden />
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Repetitive task detector</h3>
          <p className="mt-0.5 text-[13px] text-ink-secondary">
            Ask: &quot;What repetitive tasks am I doing?&quot; — mined from agent transcripts (Eric&apos;s music-agent demo).
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {DEMO_REPETITIVE_FINDINGS.map((f) => (
          <li key={f.id} className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-ink">{f.pattern}</span>
              <span className="registry-delta">{f.occurrences}× in transcripts</span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-secondary">{f.suggestion}</p>
            {f.ruleCandidate ? (
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 text-[12px] text-registry-accent underline-offset-2 hover:underline"
                onClick={() => onProposeRule?.(f.ruleCandidate!)}
              >
                <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                Propose rule: {f.ruleCandidate}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
