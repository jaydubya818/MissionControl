import { ADW_PRINCIPLES } from "@/lib/harnessAdw";
import { Lightbulb } from "lucide-react";

export function HarnessAdwPrinciples(): JSX.Element {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {ADW_PRINCIPLES.map((p) => (
        <div key={p.id} className="registry-top-card p-4">
          <Lightbulb className="h-4 w-4 text-registry-accent" aria-hidden />
          <h4 className="mt-2 font-semibold text-ink">{p.title}</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{p.body}</p>
        </div>
      ))}
    </section>
  );
}
