import { FACTORY_ARTIFACTS } from "@/lib/harnessWorkshop";
import { BookOpen, FileCode, FlaskConical, ScrollText, Shield, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  rules: Shield,
  skills: BookOpen,
  docs: ScrollText,
  tests: FlaskConical,
  hooks: Unplug,
  spec: FileCode,
} as const;

export function HarnessFactoryBlueprint({ className }: { className?: string }): JSX.Element {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">Factory blueprint</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Checked-in artifacts agents read — Eric stores the factory spec in-repo, not scattered markdown.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-2.5">Path</th>
              <th className="px-4 py-2.5">Kind</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {FACTORY_ARTIFACTS.map((a) => {
              const Icon = KIND_ICON[a.kind];
              return (
                <tr key={a.id} className="border-b border-line/60 hover:bg-surface-1">
                  <td className="px-4 py-2.5">
                    <code className="font-mono text-[12px] text-registry-accent">{a.path}</code>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="registry-contains-pill">
                      <Icon className="h-3 w-3" aria-hidden />
                      {a.kind}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-secondary sm:table-cell">{a.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="registry-eval-footnote">
        Establish a factory council — align on which rules are team-wide vs personal (Eric Q&A on rule silos).
      </p>
    </section>
  );
}
