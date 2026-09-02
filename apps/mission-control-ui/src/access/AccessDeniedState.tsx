import { LockKeyhole } from "lucide-react";
import type { MainView } from "../TopNav";
import { Button } from "@/components/ui/button";

export function AccessDeniedState({
  requestedView,
  persona,
  reason,
  landingView,
  onReturn,
}: {
  requestedView: MainView;
  persona?: string;
  reason?: string;
  landingView: MainView;
  onReturn: (view: MainView) => void;
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface-1 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary">
          <LockKeyhole size={18} aria-hidden />
        </div>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Access boundary
        </div>
        <h1 className="mt-1 text-xl font-semibold text-ink">This area is not in your access profile</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {reason ?? `Your ${persona?.toLowerCase() ?? "current"} profile does not include ${requestedView}.`}
          {" "}Mission Control has not revealed whether any inaccessible record exists.
        </p>
        {persona ? (
          <div className="mx-auto mt-4 w-fit rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-secondary">
            Active persona: {persona[0]}{persona.slice(1).toLowerCase()}
          </div>
        ) : null}
        <Button className="mt-5" onClick={() => onReturn(landingView)}>
          Open my default view
        </Button>
      </div>
    </div>
  );
}
