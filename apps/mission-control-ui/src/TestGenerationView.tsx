import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface TestGenerationViewProps {
  projectId: Id<"projects"> | null;
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-line-control bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted";

export function TestGenerationView({ projectId }: TestGenerationViewProps) {
  const [testType, setTestType] = useState("api_functional");
  const [suiteName, setSuiteName] = useState("Generated Suite");
  const [sourceText, setSourceText] = useState('{"endpoints":[{"method":"GET","url":"/health"}]}');
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const suites = useQuery((api as any).testGeneration.list, { projectId: projectId ?? undefined, limit: 30 });
  const generate = useAction((api as any).testGeneration.generate);
  const execute = useAction((api as any).testGeneration.execute);
  const suite = useQuery((api as any).testGeneration.get, selectedSuiteId ? { id: selectedSuiteId } : "skip");

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">Test Generation</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">Generate API/UI/Hybrid test suites from source payloads and execute them.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <input
            className={INPUT_CLASS}
            value={suiteName}
            onChange={(e) => setSuiteName(e.target.value)}
            placeholder="Suite name"
          />
          <select
            className={INPUT_CLASS}
            value={testType}
            onChange={(e) => setTestType(e.target.value)}
          >
            <option value="api_functional">api_functional</option>
            <option value="ui_e2e">ui_e2e</option>
            <option value="hybrid_workflow">hybrid_workflow</option>
            <option value="performance">performance</option>
            <option value="security">security</option>
          </select>
          <Button
            onClick={async () => {
              const sourceData = JSON.parse(sourceText);
              await generate({
                projectId: projectId ?? undefined,
                createdBy: "operator",
                testType,
                sourceData,
                suiteName,
                autoExecute: false,
              });
            }}
          >
            Generate Suite
          </Button>
        </div>
        <textarea
          className="min-h-[120px] w-full rounded-lg border border-line bg-surface-1 px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-muted"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
        />
      </section>

      {suite && (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
          <h2 className="text-[15px] font-semibold text-ink">Selected Suite</h2>
          <p className="text-[13.5px] text-ink-secondary">{suite.name} · {suite.testType}</p>
          {suite.gherkinFeature && (
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-secondary">{suite.gherkinFeature}</pre>
          )}
          <Button
            size="sm"
            className="self-start"
            onClick={async () => {
              // The result is no longer written from the client. Persisting
              // pass/fail evidence is a server responsibility (`internal`
              // `execution.storeResult`); this button previously wrote the
              // suite result a second time on top of the one the action had
              // already stored, doubling every row in Execution Results.
              setExecutionError(null);
              try {
                await execute({ id: suite._id, executedBy: "operator" });
              } catch (error) {
                setExecutionError(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            Execute Selected Suite
          </Button>
          {executionError && (
            <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] text-ink-secondary">
              {executionError}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Suites</h2>
        <div className="flex flex-col gap-2">
          {(suites ?? []).map((row: any) => (
            <div
              key={row._id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 transition-colors duration-150 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-ink">{row.name}</div>
                <div className="text-[12.5px] text-ink-muted">{row.testType} · {row.status}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedSuiteId(row._id)}>Select</Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
