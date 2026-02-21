import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface RecorderViewProps {
  projectId: Id<"projects"> | null;
}

export function RecorderView({ projectId }: RecorderViewProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [url, setUrl] = useState("http://localhost:3000");
  const [eventType, setEventType] = useState("click");
  const [selector, setSelector] = useState("#submit");

  const list = useQuery((api as any).testRecordings.list, { projectId: projectId ?? undefined, limit: 20 });
  const start = useMutation((api as any).testRecordings.start);
  const captureEvent = useMutation((api as any).testRecordings.captureEvent);
  const stop = useMutation((api as any).testRecordings.stop);
  const current = useQuery((api as any).testRecordings.getBySession, sessionId ? { sessionId } : "skip");

  const canRecord = useMemo(() => Boolean(sessionId), [sessionId]);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Recorder Agent</h2>
        <p className="text-sm text-muted-foreground">Capture DOM-like events and generate Playwright + Gherkin outputs.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Target URL"
          />
          <Button
            onClick={async () => {
              const result = await start({ projectId: projectId ?? undefined, userId: "operator", url });
              setSessionId(result.sessionId);
            }}
          >
            Start Recording
          </Button>
          <Button
            variant="outline"
            disabled={!canRecord}
            onClick={async () => {
              if (!sessionId) return;
              await stop({ sessionId });
              setSessionId(null);
            }}
          >
            Stop & Generate
          </Button>
        </div>

        <div className="flex gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            <option value="navigate">navigate</option>
            <option value="click">click</option>
            <option value="input">input</option>
            <option value="hover">hover</option>
          </select>
          <input
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="selector or value"
          />
          <Button
            variant="secondary"
            disabled={!canRecord}
            onClick={async () => {
              if (!sessionId) return;
              await captureEvent({
                sessionId,
                eventType,
                data: eventType === "navigate" ? { url: selector } : eventType === "input" ? { selector: "#field", value: selector } : { selector },
              });
            }}
          >
            Add Event
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">Active session: {sessionId ?? "none"}</p>
      </section>

      {current && (
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-medium">Current Session Preview</h3>
          <p className="text-sm text-muted-foreground">Events: {current.events?.length ?? 0}</p>
          {current.playwrightCode && (
            <pre className="rounded-md bg-muted/40 p-3 text-xs overflow-auto">{current.playwrightCode.join("\n")}</pre>
          )}
          {current.gherkinScenario && (
            <pre className="rounded-md bg-muted/40 p-3 text-xs overflow-auto">{current.gherkinScenario}</pre>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Recent Recording Sessions</h3>
        <div className="space-y-2">
          {(list ?? []).map((item: any) => (
            <div key={item._id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{item.sessionId}</div>
                <div className="text-xs text-muted-foreground">{item.status} · {item.url ?? "no URL"}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSessionId(item.sessionId)}>Open</Button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
