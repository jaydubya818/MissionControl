import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface HybridWorkflowViewProps {
  projectId: Id<"projects"> | null;
}

export function HybridWorkflowView({ projectId }: HybridWorkflowViewProps) {
  const [name, setName] = useState("Checkout E2E Workflow");
  const [apiStepsText, setApiStepsText] = useState('[{"title":"Create cart"},{"title":"Create session"}]');
  const [uiStepsText, setUiStepsText] = useState('["await page.goto(\\"/checkout\\")","await page.click(\\"#submit\\")"]');

  const list = useQuery((api as any).hybridWorkflows.list, { projectId: projectId ?? undefined, limit: 30 });
  const create = useMutation((api as any).hybridWorkflows.create);
  const execute = useAction((api as any).hybridWorkflows.execute);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Hybrid Workflows</h2>
        <p className="text-sm text-muted-foreground">Build and execute combined API setup + UI validation flows.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name"
        />
        <textarea
          className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          value={apiStepsText}
          onChange={(e) => setApiStepsText(e.target.value)}
        />
        <textarea
          className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          value={uiStepsText}
          onChange={(e) => setUiStepsText(e.target.value)}
        />
        <Button
          onClick={() =>
            create({
              projectId: projectId ?? undefined,
              name,
              description: "Generated from Mission Control UI",
              apiSetupSteps: JSON.parse(apiStepsText),
              uiValidationSteps: JSON.parse(uiStepsText),
              executionMode: "hybrid",
              stopOnFailure: true,
              timeoutSeconds: 300,
              retryEnabled: true,
              createdBy: "operator",
            })
          }
        >
          Create Workflow
        </Button>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Workflows</h3>
        <div className="space-y-2">
          {(list ?? []).map((row: any) => (
            <div key={row._id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">
                  API {row.apiSetupSteps.length} · UI {row.uiValidationSteps.length} · {row.active ? "active" : "inactive"}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => execute({ id: row._id, executedBy: "operator" })}>
                Execute
              </Button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
