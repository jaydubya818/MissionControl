import { useMemo, useState } from "react";
import {
  ADW_SANDBOXES,
  NODE_KIND_STYLES,
  type AdwNode,
  type AdwSandbox,
  type SandboxKind,
} from "@/lib/harnessAdw";
import { cn } from "@/lib/utils";

const INTAKE_LAYOUT: Array<{ node: AdwNode; x: number; y: number }> = [
  { node: { id: "support", label: "Support", kind: "human" }, x: 48, y: 72 },
  { node: { id: "product", label: "Product", kind: "human" }, x: 48, y: 132 },
  { node: { id: "engineer-in", label: "Engineer", kind: "human" }, x: 48, y: 192 },
  { node: { id: "kanban", label: "Kanban ticket", kind: "decision" }, x: 168, y: 132 },
  { node: { id: "eng-prompt", label: "Engineer prompt", kind: "human" }, x: 48, y: 272 },
  { node: { id: "start-factory", label: "Start factory", kind: "decision" }, x: 168, y: 272 },
  { node: { id: "in-progress", label: "In progress", kind: "decision" }, x: 168, y: 352 },
  { node: { id: "router", label: "Factory router", kind: "agent" }, x: 320, y: 200 },
  { node: { id: "setup-sandbox", label: "Setup sandbox", kind: "decision" }, x: 320, y: 320 },
];

const SANDBOX_Y: Record<SandboxKind, number> = {
  hotfix: 48,
  feature: 168,
  bug: 288,
  chore: 408,
  custom: 528,
};

function drawNode(
  node: AdwNode,
  x: number,
  y: number,
  opts?: { selected?: boolean; small?: boolean; onClick?: () => void }
): JSX.Element {
  const style = NODE_KIND_STYLES[node.kind];
  const w = opts?.small ? 88 : 100;
  const h = opts?.small ? 28 : 32;
  const selected = opts?.selected;

  if (style.shape === "circle") {
    const r = opts?.small ? 22 : 26;
    return (
      <g
        key={`${node.id}-${x}-${y}`}
        className={opts?.onClick ? "cursor-pointer" : undefined}
        onClick={opts?.onClick}
        role={opts?.onClick ? "button" : undefined}
      >
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={style.fill}
          stroke={selected ? "#4ade80" : style.stroke}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        <text x={x} y={y + 4} textAnchor="middle" fill={style.text} fontSize={opts?.small ? 9 : 10} fontWeight={600}>
          {node.label.length > 12 ? `${node.label.slice(0, 11)}…` : node.label}
        </text>
      </g>
    );
  }

  if (style.shape === "diamond") {
    const s = opts?.small ? 24 : 30;
    const points = `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
    return (
      <g key={`${node.id}-${x}-${y}`} className={opts?.onClick ? "cursor-pointer" : undefined} onClick={opts?.onClick}>
        <polygon
          points={points}
          fill={style.fill}
          stroke={selected ? "#4ade80" : style.stroke}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        <text x={x} y={y + 3} textAnchor="middle" fill={style.text} fontSize={9} fontWeight={600}>
          {node.label}
        </text>
      </g>
    );
  }

  return (
    <g key={`${node.id}-${x}-${y}`} className={opts?.onClick ? "cursor-pointer" : undefined} onClick={opts?.onClick}>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={6}
        fill={style.fill}
        stroke={selected ? "#4ade80" : style.stroke}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <text x={x} y={y + 4} textAnchor="middle" fill={style.text} fontSize={opts?.small ? 9 : 10} fontWeight={600}>
        {node.label}
      </text>
    </g>
  );
}

function SandboxLane({
  sandbox,
  baseY,
  selected,
  onSelect,
}: {
  sandbox: AdwSandbox;
  baseY: number;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const startX = 480;
  const step = 108;
  const boxW = sandbox.nodes.length * step + 80;
  const boxH = 88;

  return (
    <g>
      <rect
        x={startX - 20}
        y={baseY - 12}
        width={boxW}
        height={boxH}
        rx={10}
        fill="rgba(15, 17, 20, 0.55)"
        stroke={selected ? "#4ade80" : "rgba(255,255,255,0.08)"}
        strokeWidth={selected ? 2 : 1}
        className="cursor-pointer"
        onClick={onSelect}
      />
      <text x={startX - 8} y={baseY + 2} fill="#a7abb4" fontSize={10} fontWeight={700}>
        {sandbox.label}
      </text>
      {sandbox.nodes.map((node, i) => {
        const x = startX + 60 + i * step;
        const y = baseY + 38;
        return (
          <g key={node.id}>
            {i > 0 && (
              <line
                x1={x - step + 44}
                y1={y}
                x2={x - 44}
                y2={y}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={1.2}
                markerEnd="url(#adw-arrow)"
              />
            )}
            {drawNode(node, x, y, { small: true })}
          </g>
        );
      })}
    </g>
  );
}

export function HarnessSoftwareFactoryDiagram({
  className,
  onSandboxSelect,
}: {
  className?: string;
  onSandboxSelect?: (id: SandboxKind) => void;
}): JSX.Element {
  const [selected, setSelected] = useState<SandboxKind>("hotfix");

  const handleSelect = (id: SandboxKind) => {
    setSelected(id);
    onSandboxSelect?.(id);
  };

  const activeSandbox = useMemo(
    () => ADW_SANDBOXES.find((s) => s.id === selected) ?? ADW_SANDBOXES[0],
    [selected]
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="adw-factory-scrolly overflow-x-auto rounded-xl border border-line bg-[#0a0b0d] p-4">
        <svg viewBox="0 0 1280 600" className="min-w-[1100px] w-full" aria-label="Software factory ADW diagram">
          <defs>
            <marker id="adw-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.35)" />
            </marker>
            <marker id="adw-arrow-pass" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#4ade80" />
            </marker>
            <marker id="adw-arrow-fail" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#f87171" />
            </marker>
          </defs>

          <text x={48} y={36} fill="#717680" fontSize={11} fontWeight={700} letterSpacing="0.08em">
            INTAKE
          </text>
          <text x={480} y={36} fill="#717680" fontSize={11} fontWeight={700} letterSpacing="0.08em">
            SPECIALIZED SANDBOXES (ADWs)
          </text>
          <text x={1120} y={36} fill="#717680" fontSize={11} fontWeight={700} letterSpacing="0.08em">
            SHIP
          </text>

          {/* Intake edges */}
          <line x1={74} y1={72} x2={140} y2={120} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={74} y1={132} x2={140} y2={132} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={74} y1={192} x2={140} y2={144} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={168} y1={156} x2={168} y2={248} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={74} y1={272} x2={140} y2={272} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={168} y1={288} x2={168} y2={336} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={198} y1={132} x2={270} y2={200} stroke="rgba(255,255,255,0.15)" strokeWidth={1} markerEnd="url(#adw-arrow)" />
          <line x1={168} y1={368} x2={320} y2={336} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={370} y1={216} x2={370} y2={296} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <line x1={370} y1={320} x2={460} y2={200} stroke="#4ade80" strokeWidth={1.2} markerEnd="url(#adw-arrow-pass)" />
          <line x1={370} y1={320} x2={460} y2={320} stroke="#4ade80" strokeWidth={1.2} />
          <line x1={370} y1={320} x2={460} y2={440} stroke="#4ade80" strokeWidth={1.2} />
          <line x1={370} y1={320} x2={460} y2={560} stroke="#4ade80" strokeWidth={1.2} />

          {INTAKE_LAYOUT.map(({ node, x, y }) => drawNode(node, x, y))}

          {ADW_SANDBOXES.map((sb) => (
            <SandboxLane
              key={sb.id}
              sandbox={sb}
              baseY={SANDBOX_Y[sb.id]}
              selected={selected === sb.id}
              onSelect={() => handleSelect(sb.id)}
            />
          ))}

          {/* Outro */}
          <line x1={980} y1={300} x2={1080} y2={300} stroke="rgba(255,255,255,0.2)" strokeWidth={1.2} markerEnd="url(#adw-arrow)" />
          {drawNode({ id: "merge", label: "Merge", kind: "decision" }, 1120, 300)}
          <line x1={1150} y1={300} x2={1200} y2={300} stroke="#4ade80" strokeWidth={1.5} markerEnd="url(#adw-arrow-pass)" />
          {drawNode({ id: "ship", label: "Ship", kind: "terminal" }, 1240, 300)}

          {/* Legend */}
          <g transform="translate(48, 480)">
            {(
              [
                ["human", "Human"],
                ["agent", "Agent"],
                ["code", "Code"],
                ["decision", "Decision"],
              ] as const
            ).map(([kind, label], i) => (
              <g key={kind} transform={`translate(${i * 120}, 0)`}>
                {drawNode({ id: kind, label, kind }, 20, 16, { small: true })}
                <text x={48} y={20} fill="#717680" fontSize={10}>
                  {label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      <SandboxDetail sandbox={activeSandbox} />
    </div>
  );
}

function SandboxDetail({ sandbox }: { sandbox: AdwSandbox }): JSX.Element {
  return (
    <div className="registry-top-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-ink">{sandbox.label}</h4>
        <span className="registry-tag">{sandbox.modelHint}</span>
      </div>
      <p className="mt-2 text-[13px] text-ink-secondary">{sandbox.description}</p>
      {sandbox.edges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {sandbox.edges.map((e) => (
            <span
              key={`${e.from}-${e.to}-${e.variant}`}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[10px]",
                e.variant === "pass" && "border-ok/40 text-registry-accent",
                e.variant === "fail" && "border-err/40 text-err",
                e.variant === "default" && "border-line text-ink-muted"
              )}
            >
              {e.from} → {e.to}
              {e.label ? ` (${e.label})` : ""}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ink-muted">Define your custom ADW nodes in code + agents.</p>
      )}
    </div>
  );
}
