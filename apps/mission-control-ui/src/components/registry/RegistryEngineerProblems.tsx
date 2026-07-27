import { AlertTriangle, Eye, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const PROBLEMS = [
  {
    id: "practices",
    icon: Eye,
    title: "We don't know what good looks like",
    body: "Practices vary team to team — how you work with agents isn't standardized yet.",
  },
  {
    id: "verify",
    icon: Zap,
    title: "We can't verify generated code",
    body: "Code ships faster than humans can read it; review becomes the bottleneck.",
  },
  {
    id: "coordinate",
    icon: AlertTriangle,
    title: "AI writes code faster than we coordinate",
    body: "Colleagues deploy changes nobody has context on — communication is the new limiter.",
  },
  {
    id: "security",
    icon: Shield,
    title: "Your AI is the new attack surface",
    body: "Agents make review decisions; skills and MCP plugins expand the trust boundary.",
  },
] as const;

/** Four engineer problems from the Baptiste Fernandez / Tessl talk opening. */
export function RegistryEngineerProblems({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Four problems engineers face in 2026</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Agent enablement is an organizational problem — context lifecycle tooling addresses all four.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROBLEMS.map((p) => (
          <div key={p.id} className="rounded-xl border border-line bg-surface-1 p-4">
            <div className="flex items-start gap-3">
              <p.icon size={18} className="mt-0.5 shrink-0 text-registry-accent" aria-hidden />
              <div>
                <div className="text-[14px] font-semibold text-ink">{p.title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">{p.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
