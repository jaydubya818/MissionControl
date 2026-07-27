import { ArrowRight } from "lucide-react";

export interface RegistryOptimizeCtaProps {
  onEvaluate?: () => void;
}

/** Tessl-style “Optimize Your Context” feature block. */
export function RegistryOptimizeCta({ onEvaluate }: RegistryOptimizeCtaProps): JSX.Element {
  const steps = [
    {
      n: "01",
      title: "Submit your skill",
      body: "Point Mission Control at your GitHub repo or paste your skill content directly.",
    },
    {
      n: "02",
      title: "Get your score",
      body: "Evals run automatically. You see exactly where your skill works, where it doesn't, and what to fix.",
    },
    {
      n: "03",
      title: "Improve and republish",
      body: "Act on the suggestions, push an update, and watch your score move. Every version is tracked.",
    },
  ];

  return (
    <section className="registry-optimize-block">
      <div className="registry-optimize-copy">
        <div className="registry-kicker">Optimize your context</div>
        <h2 className="registry-optimize-title">Make your skill work correctly, provably.</h2>
        <p className="registry-optimize-body">
          Submit a skill, run evals against real scenarios, and get a score that shows baseline vs
          with-context performance. Fix what fails, republish, and track every version. Code is the
          artifact — context is the asset.
        </p>
        <button type="button" onClick={onEvaluate} className="registry-optimize-btn">
          Optimize with Mission Control
          <ArrowRight size={16} aria-hidden />
        </button>
      </div>
      <div className="registry-optimize-steps">
        {steps.map((step) => (
          <div key={step.n} className="registry-optimize-step">
            <div className="registry-optimize-step-title">
              <span className="registry-step-num">{step.n}</span>
              {step.title}
            </div>
            <p className="registry-optimize-step-body">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
