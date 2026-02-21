import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface CodeGenViewProps {
  projectId: Id<"projects"> | null;
}

export function CodeGenView({ projectId }: CodeGenViewProps) {
  const [filePath, setFilePath] = useState("apps/mission-control-ui/src/App.tsx");
  const [prompt, setPrompt] = useState("Add telemetry breadcrumb for quality tab changes.");

  const requests = useQuery((api as any).codegen.list, { projectId: projectId ?? undefined, limit: 40 });
  const requestPatch = useMutation((api as any).codegen.requestPatch);
  const generateDiff = useAction((api as any).codegen.generateDiff);
  const applyAndPr = useAction((api as any).codegen.applyAndPR);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">CodeGen Agent</h2>
        <p className="text-sm text-muted-foreground">Generate diffs from prompts and produce PR metadata for approval workflows.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
        />
        <textarea
          className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          onClick={() =>
            requestPatch({
              projectId: projectId ?? undefined,
              filePath,
              prompt,
              requestedBy: "operator",
            })
          }
        >
          Create CodeGen Request
        </Button>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Requests</h3>
        <div className="space-y-2">
          {(requests ?? []).map((row: any) => (
            <div key={row._id} className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{row.filePath}</div>
                  <div className="text-xs text-muted-foreground">{row.status} · {row.requestId}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => generateDiff({ id: row._id })}>
                    Generate Diff
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyAndPr({ id: row._id })}>
                    Apply + PR
                  </Button>
                </div>
              </div>
              {row.diff && <pre className="rounded bg-muted/40 p-2 text-xs overflow-auto">{row.diff}</pre>}
              {row.prUrl && (
                <a className="text-xs text-primary underline" href={row.prUrl} target="_blank" rel="noreferrer">
                  {row.prUrl}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
