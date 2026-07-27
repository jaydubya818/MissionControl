import { FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Two-bucket evaluation model: structure review vs scenario pressure tests. */
export function RegistryEvalBuckets({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      <article className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-registry-accent" aria-hidden />
          <h3 className="text-[15px] font-semibold text-ink">Bucket 1 — Structure & activation</h3>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
          Will the agent activate the skill at the right time? Scored on specificity, completeness,
          and trigger-term quality against Anthropic best practices.
        </p>
        <ul className="mt-3 space-y-1 text-[12px] text-ink-muted">
          <li>· Frontmatter & validation checks</li>
          <li>· Description as activation function</li>
          <li>· Progressive disclosure in body</li>
        </ul>
      </article>

      <article className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-registry-accent" aria-hidden />
          <h3 className="text-[15px] font-semibold text-ink">Bucket 2 — Scenario pressure tests</h3>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
          For conventions you care about (Argon2 hashing, no hard-coded secrets), generate scenarios
          and compare baseline vs with-skill — even frontier models fail without good context.
        </p>
        <ul className="mt-3 space-y-1 text-[12px] text-ink-muted">
          <li>· Without context (baseline)</li>
          <li>· With skill loaded (candidate)</li>
          <li>· Per-criterion pass/fail tables</li>
        </ul>
      </article>
    </div>
  );
}
