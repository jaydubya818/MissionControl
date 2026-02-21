import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface GherkinStudioViewProps {
  projectId: Id<"projects"> | null;
}

export function GherkinStudioView(_props: GherkinStudioViewProps) {
  const [scenarioName, setScenarioName] = useState("Checkout journey");
  const [eventsJson, setEventsJson] = useState(
    '[{"eventType":"navigate","data":{"url":"/checkout"}},{"eventType":"click","data":{"selector":"#pay"}}]'
  );
  const [gherkinText, setGherkinText] = useState("");
  const [parsed, setParsed] = useState<string[]>([]);

  const generateFromRecording = useAction((api as any).gherkin.generateFromRecording);
  const parse = useAction((api as any).gherkin.parse);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Gherkin Studio</h2>
        <p className="text-sm text-muted-foreground">Generate and parse BDD features from recorded events.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={scenarioName}
          onChange={(e) => setScenarioName(e.target.value)}
          placeholder="Scenario name"
        />
        <textarea
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          value={eventsJson}
          onChange={(e) => setEventsJson(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              const result = await generateFromRecording({ name: scenarioName, events: JSON.parse(eventsJson) });
              setGherkinText(result.gherkin);
            }}
          >
            Generate Gherkin
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const result = await parse({ gherkin: gherkinText });
              setParsed(result.steps ?? []);
            }}
          >
            Parse Steps
          </Button>
        </div>
      </section>

      {gherkinText && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-medium">Generated Feature</h3>
          <pre className="rounded-md bg-muted/40 p-3 text-xs overflow-auto">{gherkinText}</pre>
        </section>
      )}

      {parsed.length > 0 && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-medium">Parsed Steps</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {parsed.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
