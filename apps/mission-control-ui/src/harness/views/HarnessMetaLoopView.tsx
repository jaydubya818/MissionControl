import { useMutation, useQuery } from "convex/react";
import { Inbox } from "lucide-react";
import { useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessAutomatePanel } from "../components/HarnessAutomatePanel";
import { Button } from "@/components/ui/button";
import type { MainView } from "../../TopNav";

export function HarnessMetaLoopView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: MainView) => void;
}): JSX.Element {
  const inbox = useQuery(api.factory.metaLoop.listInbox, {
    projectId: projectId ?? undefined,
    status: "OPEN",
  });
  const seed = useMutation(api.factory.metaLoop.seedDemoSuggestions);
  const resolve = useMutation(api.factory.metaLoop.resolve);

  useEffect(() => {
    if (inbox !== undefined && inbox.length === 0) {
      void seed({ projectId: projectId ?? undefined });
    }
  }, [inbox, projectId, seed]);

  return (
    <HarnessPage
      title="Meta Loop Inbox"
      description="Only correct once — observed failures become verifiers, skills, and evals."
      icon={<Inbox className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[900px] space-y-3">
        {!inbox ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          inbox.map((s) => (
            <div key={s._id} className="rounded-xl border border-line bg-surface-1 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase text-ink-muted">{s.kind}</span>
                  <h3 className="mt-2 font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink-secondary">{s.summary}</p>
                  {s.sourceRef && (
                    <p className="mt-1 text-xs text-ink-muted">
                      Lineage: {s.sourceRef}
                      {s.kind === "EVAL_SCENARIO" ? " → accept creates eval scenario in Registry" : ""}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void resolve({ suggestionId: s._id, action: "ACCEPT" })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void resolve({ suggestionId: s._id, action: "DISMISS" })}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
        <HarnessAutomatePanel
          projectId={projectId}
          skillName="meta-loop-scan"
          schedule="0 7 * * *"
          onNavigate={onNavigate}
        />
      </div>
    </HarnessPage>
  );
}
