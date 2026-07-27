import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { MainView } from "../../TopNav";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessLegibilityCallout } from "../components/HarnessPrinciples";
import { HarnessCodeReviewWizardSteps } from "../components/HarnessCodeReviewWizardSteps";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../../../convex/_generated/dataModel";

const WIZARD_STEPS = [
  { id: 1, title: "Evidence", detail: "Scan PR comments, issues, and CI failures from the last week — legible surfaces only." },
  { id: 2, title: "Confirm findings", detail: "Editable checklist of recurring agent mistakes (security, reuse, error handling)." },
  { id: 3, title: "Review skill", detail: "Create an owned code-review skill in Registry — team agrees on style guide." },
  { id: 4, title: "CI automation", detail: "GitHub Action / Launch — outer loop runs on every PR open." },
  { id: 5, title: "Change Risk", detail: "Policy gate: small stacked PRs auto-merge; production paths need human review." },
  { id: 6, title: "Verifiers", detail: "Shift expensive checks left — targeted LLM lint rules at ~$0.30/day vs ~$25/PR." },
  { id: 7, title: "Meta loop", detail: "Maintenance agent mines PR comments nightly and proposes harness fixes." },
];

export function HarnessCodeReviewWizardView({
  onNavigate,
  projectId,
}: {
  onNavigate: (view: MainView) => void;
  projectId?: Id<"projects"> | null;
}): JSX.Element {
  const [step, setStep] = useState(0);
  const current = WIZARD_STEPS[step];

  return (
    <HarnessPage
      title="Code Review Setup"
      description="Golden path: one outcome → three review layers (agentic, risk, verifiers)."
      icon={<ClipboardCheck className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[640px] space-y-6">
        <HarnessLegibilityCallout />
        <div className="flex gap-1">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-registry-accent" : "bg-surface-2"}`}
            />
          ))}
        </div>

        <div className="rounded-xl border border-line bg-surface-1 p-6">
          <div className="text-xs uppercase text-ink-muted">
            Step {current.id} of {WIZARD_STEPS.length}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-ink">{current.title}</h2>
          <p className="mt-2 text-sm text-ink-secondary">{current.detail}</p>
          <div className="mt-4">
            <HarnessCodeReviewWizardSteps step={step} projectId={projectId} onNavigate={onNavigate} />
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button size="sm" onClick={() => onNavigate("harness-health")}>
              Finish → Factory Health
            </Button>
          )}
        </div>
      </div>
    </HarnessPage>
  );
}
