import { PATTERN_CATEGORIES, type PatternCategoryId } from "@/lib/harnessPatterns";
import { cn } from "@/lib/utils";
import { TrendingUp, Minus, Anchor } from "lucide-react";

const MATURITY_LABEL = {
  high: "High adoption",
  medium: "Medium",
  low: "Immature · high leverage",
} as const;

const TREND_ICON = {
  rising: TrendingUp,
  stable: Minus,
  settling: Anchor,
} as const;

export function HarnessPatternCategories({
  highlightId,
  className,
}: {
  highlightId?: PatternCategoryId;
  className?: string;
}): JSX.Element {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">AI Patterns index</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          Hand-curated categories — inspired by tessl.io/patterns. Social signals consolidated for org conversations.
        </p>
      </div>
      <div className="space-y-4">
        {PATTERN_CATEGORIES.map((cat) => {
          const highlight = cat.id === highlightId;
          return (
            <article
              key={cat.id}
              className={cn(
                "registry-top-card overflow-hidden",
                highlight && "border-registry-accent/40"
              )}
            >
              <div className="border-b border-line/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-ink">{cat.label}</h4>
                  <span className="registry-tag">{MATURITY_LABEL[cat.maturity]}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-muted">{cat.subtitle}</p>
                <p className="mt-1.5 text-[13px] text-ink-secondary">{cat.description}</p>
              </div>
              <ul className="divide-y divide-line/40">
                {cat.topics.map((topic) => {
                  const TrendIcon = topic.trend ? TREND_ICON[topic.trend] : Minus;
                  return (
                    <li key={topic.id} className="flex gap-3 px-4 py-2.5">
                      <TrendIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-registry-accent" aria-hidden />
                      <div>
                        <div className="text-[13px] font-medium text-ink">{topic.title}</div>
                        <div className="text-[12px] text-ink-secondary">{topic.summary}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
