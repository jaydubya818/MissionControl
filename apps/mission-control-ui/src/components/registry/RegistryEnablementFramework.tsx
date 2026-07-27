import { cn } from "@/lib/utils";

const ROLES = [
  {
    role: "Individual contributor",
    generate: "Author skills from repeated PR feedback; lint locally before PR.",
    evaluate: "Run structural review + 2–3 scenario evals on your branch.",
    distribute: "Publish to team registry; open PR with eval evidence.",
    observe: "Watch activation in agent logs; file meta-loop fixes.",
  },
  {
    role: "Team lead / EM",
    generate: "Codify team conventions into owned skills; block vague descriptions.",
    evaluate: "Gate merges on skill-lint CI; require scenario pass for security skills.",
    distribute: "Private registry + install policies; share across squad lanes.",
    observe: "Weekly skill health review; retire rules when models change.",
  },
  {
    role: "VP / platform",
    generate: "Institutional policies (API, security) as evaluated context packages.",
    evaluate: "Cross-model eval matrix; cost tier recommendations per skill.",
    distribute: "Enterprise registry, governance, compliance artifacts.",
    observe: "Agent enablement metrics; context flywheel across departments.",
  },
] as const;

/** Role-based enablement mapped to the Context Development Lifecycle. */
export function RegistryEnablementFramework({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Enable your team by role</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Agent enablement looks different for ICs, managers, and VPs — same lifecycle, different
          leverage points.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="px-4 py-2.5 font-medium text-ink-muted">Role</th>
              <th className="px-4 py-2.5 font-medium text-ink-muted">Generate</th>
              <th className="px-4 py-2.5 font-medium text-ink-muted">Evaluate</th>
              <th className="px-4 py-2.5 font-medium text-ink-muted">Distribute</th>
              <th className="px-4 py-2.5 font-medium text-ink-muted">Observe</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((row) => (
              <tr key={row.role} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 align-top font-semibold text-ink">{row.role}</td>
                <td className="px-4 py-3 align-top text-ink-secondary">{row.generate}</td>
                <td className="px-4 py-3 align-top text-ink-secondary">{row.evaluate}</td>
                <td className="px-4 py-3 align-top text-ink-secondary">{row.distribute}</td>
                <td className="px-4 py-3 align-top text-ink-secondary">{row.observe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[12px] text-ink-secondary">
        <strong className="text-ink">CI integration:</strong> add skill eval to GitHub Actions on
        SKILL.md changes — structural lint on every PR, scenario evals on release branches. See{" "}
        <code className="font-mono text-[11px]">node scripts/run-context-eval.mjs</code> and{" "}
        <code className="font-mono text-[11px]">eval.framework</code> feature flag.
      </div>
    </div>
  );
}
