import { MessageSquareWarning, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Explains tickets + PRs as legible surfaces (not chat-trapped feedback). */
export function HarnessLegibilityCallout({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-xl border border-registry-accent/25 bg-registry-accent-soft p-4",
        className
      )}
    >
      <div className="flex gap-3">
        <MessageSquareWarning className="h-5 w-5 shrink-0 text-registry-accent" aria-hidden />
        <div>
          <div className="text-sm font-semibold text-ink">Legible surfaces — not chat</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
            OpenAI saw ~5× productivity when moving from interactive sessions to issue tracker + PR
            flow. All agent feedback lives on tickets and PR comments so maintenance agents can mine
            it — nothing trapped in Claude Code tabs.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
            <li>· File ticket → agent runs → PR with comments</li>
            <li>· Leave PR comments; meta loop extracts harness fixes</li>
            <li>· Don't course-correct mid-session — fix harness, retry</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Harness-first principle from the talk. */
export function HarnessFirstCallout({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-xl border border-warn/30 bg-warn/5 p-4",
        className
      )}
    >
      <div className="text-sm font-semibold text-ink">Harness-first feedback</div>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
        When an agent fails, don't tell it to fix the PR. Stop, throw the PR away, and ask: what
        check (test, skill, verifier) would prevent this mistake? Update the harness once, then
        retry. Slot-machine retries feel bad — PR comments + background meta loop make it legible.
      </p>
    </div>
  );
}

/** Small PR incentive via change risk (talk: stack 200-line PRs for auto-merge). */
export function SmallPrIncentiveCallout({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-xl border border-ok/30 bg-ok/5 p-4 text-xs text-ink-secondary",
        className
      )}
    >
      <strong className="text-ink">Small PR culture:</strong> codify change-risk so contained,
      stacked 200–300 line PRs can bypass human review. Monolithic 100k-line PRs force review —
      teams naturally split work when automation rewards it.
    </div>
  );
}

/** Friday sync stopgap from Q&A. */
export function TeamSyncCallout({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("flex gap-3 rounded-xl border border-line bg-surface-1 p-4", className)}>
      <Users className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
      <div>
        <div className="text-sm font-semibold text-ink">Communication is the bottleneck</div>
        <p className="mt-1 text-xs text-ink-secondary">
          At 30% WoW PR growth, "I don't know what my neighbor is working on" is the new normal.
          Schedule a weekly hour: demo PRs, read docs together, ask questions — until agent-native
          digests exist.
        </p>
      </div>
    </div>
  );
}
