import { cn } from "@/lib/utils";

export interface ToolCallData {
  tool: string;
  status?: "ok" | "error" | "warn";
  summary?: string;
  args?: unknown;
  output?: string;
}

export interface ToolCallRowProps {
  call: ToolCallData;
  className?: string;
}

/** Waku-style expandable tool row with status dot. */
export function ToolCallRow({ call, className }: ToolCallRowProps): JSX.Element {
  const status = call.status ?? "ok";
  return (
    <div className={cn("schematic-tool", `schematic-tool-${status}`, className)}>
      <div className="schematic-tool-head">
        <span className={cn("schematic-dot", `schematic-dot-${status}`)} aria-hidden />
        <code className="font-mono text-[12.5px]">{call.tool}</code>
        {call.summary ? (
          <span className="text-[12.5px] text-ink-secondary">{call.summary}</span>
        ) : null}
      </div>
      {call.output !== undefined ? (
        <details className="mt-1.5">
          <summary className="schematic-tool-summary">args &amp; raw output</summary>
          <pre className="schematic-tool-pre">
            {call.tool}({JSON.stringify(call.args ?? {}, null, 1)}

            {call.output}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
