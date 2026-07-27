import { useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";

export function HarnessWorkLedgerView({ projectId }: { projectId: Id<"projects"> | null }): JSX.Element {
  const ledger = useQuery(api.factory.health.workLedger, {
    projectId: projectId ?? undefined,
    limit: 30,
  });

  return (
    <HarnessPage
      title="Work Ledger"
      description="Work as substance — todo, in-progress (exploded), and finished digests. Beads-style lifecycle."
      icon={<BookOpen className="h-5 w-5 text-registry-accent" />}
    >
      {!ledger ? (
        <p className="text-sm text-ink-muted">Loading work ledger…</p>
      ) : (
        <div className="mx-auto grid max-w-[1400px] gap-4 lg:grid-cols-3">
          <WorkColumn
            title="Future work"
            subtitle="Public · claimable"
            items={ledger.todo}
            variant="todo"
          />
          <WorkColumn
            title="In progress"
            subtitle="Exploded sub-tasks"
            items={ledger.inProgress}
            variant="progress"
          />
          <WorkColumn
            title="Finished"
            subtitle="Digest · resume"
            items={ledger.finished}
            variant="done"
          />
        </div>
      )}

      {ledger && (ledger.hazards.duplicateWork > 0 || ledger.hazards.lostWork > 0 || ledger.hazards.blocked > 0) && (
        <div className="mx-auto mt-4 max-w-[1400px] space-y-2">
          {ledger.hazards.duplicateWork > 0 ? (
            <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-warn">
              <strong>Duplicate work:</strong> {ledger.hazards.duplicateWork} active titles collide — consolidate before
              generating more.
            </div>
          ) : null}
          {ledger.hazards.lostWork > 0 ? (
            <div className="rounded-xl border border-err/30 bg-err/5 p-4 text-sm text-err">
              <strong>Lost work:</strong> {ledger.hazards.lostWork} in-progress items stale &gt;7d — resume or cancel.
            </div>
          ) : null}
          {ledger.hazards.blocked > 0 ? (
            <div className="rounded-xl border border-line bg-surface-1 p-4 text-sm text-ink-secondary">
              <strong>Blocked:</strong> {ledger.hazards.blocked} tasks need human unblock in Tasks.
            </div>
          ) : null}
        </div>
      )}

      <div className="mx-auto mt-8 max-w-[1400px] rounded-xl border border-line bg-surface-2 p-4 font-mono text-xs text-ink-secondary">
        <pre>{`GENERATE → FIX → REVIEW → (repeat)
Swarm rhythm: spend tokens to create work, then consume it through the factory.`}</pre>
      </div>
    </HarnessPage>
  );
}

function WorkColumn({
  title,
  subtitle,
  items,
  variant,
}: {
  title: string;
  subtitle: string;
  items: Array<{ id: string; title: string; status: string; priority?: number }>;
  variant: "todo" | "progress" | "done";
}): JSX.Element {
  const border =
    variant === "todo" ? "border-registry-accent/20" : variant === "progress" ? "border-warn/20" : "border-ok/20";
  return (
    <div className={`rounded-xl border ${border} bg-surface-1 p-4`}>
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-xs text-ink-muted">{subtitle}</div>
      <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
        {items.length === 0 ? (
          <li className="text-xs text-ink-muted">Empty</li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="rounded-lg border border-line px-3 py-2">
              <div className="text-sm text-ink">{item.title}</div>
              <div className="mt-1 flex gap-2 text-[10px] uppercase text-ink-muted">
                <span>{item.status}</span>
                {item.priority !== undefined && <span>P{item.priority}</span>}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
