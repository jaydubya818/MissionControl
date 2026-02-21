import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface TestGenerationViewProps {
  projectId: Id<"projects"> | null;
}

export function TestGenerationView({ projectId }: TestGenerationViewProps) {
  const [testType, setTestType] = useState("api_functional");
  const [suiteName, setSuiteName] = useState("Generated Suite");
  const [sourceText, setSourceText] = useState('{"endpoints":[{"method":"GET","url":"/health"}]}');
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);

  const suites = useQuery((api as any).testGeneration.list, { projectId: projectId ?? undefined, limit: 30 });
  const generate = useAction((api as any).testGeneration.generate);
  const execute = useAction((api as any).testGeneration.execute);
  const suite = useQuery((api as any).testGeneration.get, selectedSuiteId ? { id: selectedSuiteId } : "skip");
  const storeExecution = useMutation((api as any).execution.storeResult);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Test Generation</h2>
        <p className="text-sm text-muted-foreground">Generate API/UI/Hybrid test suites from source payloads and execute them.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={suiteName}
            onChange={(e) => setSuiteName(e.target.value)}
            placeholder="Suite name"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
        />
      </section>

      {suite && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-medium">Selected Suite</h3>
          <p className="text-sm text-muted-foreground">{suite.name} · {suite.testType}</p>
          {suite.gherkinFeature && <pre className="rounded-md bg-muted/40 p-3 text-xs overflow-auto">{suite.gherkinFeature}</pre>}
          <Button
            size="sm"
            onClick={async () => {
              const result = await execute({ id: suite._id, executedBy: "operator" });
              await storeExecution({
                projectId: suite.projectId,
                executionType: suite.executionMode === "hybrid" ? "hybrid" : suite.executionMode === "api_only" ? "api" : "ui",
                suiteId: suite._id,
                steps: result.steps ?? [],
                totalTime: result.totalTime ?? 0,
                passed: result.passed ?? 0,
                failed: result.failed ?? 0,
                success: result.success ?? false,
                context: result.context,
                executedBy: "operator",
              });
            }}
          >
            Execute Selected Suite
          </Button>
        </section>
      )}

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Suites</h3>
        <div className="space-y-2">
          {(suites ?? []).map((row: any) => (
            <div key={row._id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.testType} · {row.status}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedSuiteId(row._id)}>Select</Button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
