import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface RecorderViewProps {
  projectId: Id<"projects"> | null;
}

const INPUT_CLASS =
  "h-9 rounded-lg border border-line-control bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted";

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
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">Recorder Agent</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">Capture DOM-like events and generate Playwright + Gherkin outputs.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex gap-2">
          <input
            className={`flex-1 ${INPUT_CLASS}`}
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
            className={INPUT_CLASS}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            <option value="navigate">navigate</option>
            <option value="click">click</option>
            <option value="input">input</option>
            <option value="hover">hover</option>
          </select>
          <input
            className={`flex-1 ${INPUT_CLASS}`}
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

        <p className="text-[12.5px] text-ink-muted">
          Active session: <span className="font-mono">{sessionId ?? "none"}</span>
        </p>
      </section>

      {current && (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
          <h2 className="text-[15px] font-semibold text-ink">Current Session Preview</h2>
          <p className="text-[13.5px] text-ink-secondary">Events: {current.events?.length ?? 0}</p>
          {current.playwrightCode && (
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-secondary">{current.playwrightCode.join("\n")}</pre>
          )}
          {current.gherkinScenario && (
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-secondary">{current.gherkinScenario}</pre>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Recent Recording Sessions</h2>
        <div className="flex flex-col gap-2">
          {(list ?? []).map((item: any) => (
            <div
              key={item._id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 transition-colors duration-150 hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="font-mono text-[13px] font-medium text-ink">{item.sessionId}</div>
                <div className="text-[12.5px] text-ink-muted">{item.status} · {item.url ?? "no URL"}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSessionId(item.sessionId)}>Open</Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
