import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { safeExternalUrl } from "./lib/safeExternalUrl";

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
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">CodeGen Agent</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">Generate diffs from prompts and produce PR metadata for approval workflows.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <input
          className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 font-mono text-[12.5px] text-ink placeholder:text-ink-muted"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
        />
        <textarea
          className="min-h-[110px] w-full rounded-lg border border-line bg-surface-1 px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-muted"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          className="self-start"
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

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Requests</h2>
        <div className="flex flex-col gap-2">
          {(requests ?? []).map((row: any) => (
            <div key={row._id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-mono text-[13px] font-medium text-ink">{row.filePath}</div>
                  <div className="text-[12.5px] text-ink-muted">{row.status} · <span className="font-mono">{row.requestId}</span></div>
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
              {row.diff && (
                <pre className="overflow-x-auto rounded-lg bg-surface-2 p-2 font-mono text-[12px] leading-relaxed text-ink-secondary">{row.diff}</pre>
              )}
              {safeExternalUrl(row.prUrl) && (
                <a
                  className="text-[12.5px] text-ink underline underline-offset-4 hover:text-ink-secondary"
                  href={safeExternalUrl(row.prUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.prUrl}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
