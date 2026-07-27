import { useState } from "react";
import { Wrench } from "lucide-react";
import type { MainView } from "../../TopNav";
import { HarnessPage, AutomateThisCta, MaturityStepper } from "../components/HarnessUi";
import { Button } from "@/components/ui/button";

type Path = "bottoms-up" | "factory-first";

const STEPS_BOTTOMS_UP = [
  "Registry inventory",
  "Security review",
  "Quality / evals",
  "Governance policies",
  "Meta loop schedule",
];

const STEPS_FACTORY_FIRST = [
  "Code review wizard",
  "Change risk policy",
  "Verifiers from skills",
  "Control plane wiring",
  "Meta loop schedule",
];

export function HarnessBuilderView({ onNavigate }: { onNavigate: (view: MainView) => void }): JSX.Element {
  const [path, setPath] = useState<Path | null>(null);
  const [step, setStep] = useState(0);

  const steps = path === "bottoms-up" ? STEPS_BOTTOMS_UP : STEPS_FACTORY_FIRST;

  return (
    <HarnessPage
      title="Factory Builder"
      description="One thing per week — reverse jawbreaker toward a full software factory."
      icon={<Wrench className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[700px] space-y-6">
        {!path ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-xl border border-line bg-surface-1 p-4 text-left hover:border-registry-accent/40"
              onClick={() => setPath("bottoms-up")}
            >
              <div className="font-semibold text-ink">Bottoms-up</div>
              <p className="mt-1 text-xs text-ink-secondary">Skill sprawl → registry → governance</p>
            </button>
            <button
              type="button"
              className="rounded-xl border border-line bg-surface-1 p-4 text-left hover:border-registry-accent/40"
              onClick={() => setPath("factory-first")}
            >
              <div className="font-semibold text-ink">Factory-first</div>
              <p className="mt-1 text-xs text-ink-secondary">Code review bottleneck → loops</p>
            </button>
          </div>
        ) : (
          <>
            <MaturityStepper current={step >= 3 ? "ISSUE_TO_PR" : "MULTI_SESSION"} />
            <div className="text-sm text-ink">
              Step {step + 1} of {steps.length}: <strong>{steps[step]}</strong>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              {step < steps.length - 1 ? (
                <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                  Next
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    if (path === "factory-first") onNavigate("harness-code-review-wizard");
                    else onNavigate("skills");
                  }}
                >
                  Open step
                </Button>
              )}
            </div>
            <AutomateThisCta />
          </>
        )}
      </div>
    </HarnessPage>
  );
}
