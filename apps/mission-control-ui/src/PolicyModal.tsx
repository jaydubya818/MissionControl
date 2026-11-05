import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, CheckCircle2, Globe, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export function PolicyModal({ onClose }: { onClose: () => void }) {
  const policies = useQuery(api.policy.listAll);
  const activePolicy = useQuery(api.policy.getActive, {});

  const active = activePolicy ?? policies?.find((p: Doc<"policies">) => p.active && !p.projectId && !p.tenantId);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Policy</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Active agent guardrails and operational rules
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-4">
            {policies === undefined ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading policies…
              </div>
            ) : policies.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No policies defined yet.
              </div>
            ) : (
              <>
                {/* Active policy banner */}
                {active && (
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {active.name}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">v{active.version}</span>
                      </div>
                      <div className="text-xs text-primary/70 mt-0.5">Currently active policy</div>
                    </div>
                    <Badge variant="success" className="ml-auto">
                      ACTIVE
                    </Badge>
                  </div>
                )}

                {/* Policy cards */}
                <div className="space-y-3">
                  {policies.map((p: Doc<"policies">) => (
                    <div
                      key={p._id}
                      className={cn(
                        "rounded-xl border p-4 space-y-3 transition-colors",
                        p.active
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-card"
                      )}
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold",
                            p.active
                              ? "bg-primary/20 text-primary"
                              : "bg-secondary text-muted-foreground"
                          )}>
                            v{p.version}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground leading-tight">{p.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {p.scopeType === "GLOBAL" ? (
                                <Globe className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Layers className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {p.scopeType}{p.scopeId ? ` · ${p.scopeId}` : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        {p.active && (
                          <Badge variant="success" className="shrink-0">
                            ACTIVE
                          </Badge>
                        )}
                      </div>

                      {/* Notes */}
                      {p.notes && (
                        <p className="text-sm text-foreground leading-relaxed">{p.notes}</p>
                      )}

                      {/* Rules JSON */}
                      {p.rules && typeof p.rules === "object" && (
                        <div className="rounded-lg border border-border bg-background overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rules</span>
                          </div>
                          <ScrollArea className="max-h-[180px]">
                            <pre className="px-3 py-3 text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                              {JSON.stringify(p.rules, null, 2)}
                            </pre>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
