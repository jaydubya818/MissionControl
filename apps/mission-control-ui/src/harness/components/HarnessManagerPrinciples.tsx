import { Users, Zap, Eye, Shield } from "lucide-react";

const PRINCIPLES = [
  {
    icon: Users,
    title: "Worker → Manager",
    body: "Look at outcomes and artifacts, not every line. Plan synchronously; execute asynchronously.",
  },
  {
    icon: Zap,
    title: "Scope & parallelize",
    body: "One agent per unit of work — isolated VMs avoid merge collisions and side effects.",
  },
  {
    icon: Eye,
    title: "Front-load context",
    body: "Long specs and plans before send-off. Feel model strengths; rules emerge when agents drift.",
  },
  {
    icon: Shield,
    title: "Humans stay accountable",
    body: "Never outsource auth, payments, or prod pushes. Spend tokens on verification before human review.",
  },
] as const;

export function HarnessManagerPrinciples(): JSX.Element {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {PRINCIPLES.map(({ icon: Icon, title, body }) => (
        <div key={title} className="registry-top-card p-4">
          <Icon className="h-5 w-5 text-registry-accent" aria-hidden />
          <h4 className="mt-2 font-semibold text-ink">{title}</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{body}</p>
        </div>
      ))}
    </section>
  );
}
