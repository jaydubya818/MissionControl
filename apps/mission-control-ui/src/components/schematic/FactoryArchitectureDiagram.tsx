/**
 * Factory architecture diagram — React port of waku-agent archSVG (diagram.js).
 * Clickable nodes navigate to Mission Control views.
 */

import { SchematicSectionTitle } from "./SchematicSectionTitle";

export interface FactoryArchitectureStats {
  gateAuto: number;
  gateGated: number;
  skillCount: number;
  factCount: number;
  episodeCount: number;
  consolidateEvery: number;
  consolidatePending: number;
  traceFiles: number;
  evalPass: string | null;
}

interface ArchNodeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  view?: string;
  nodeId?: string;
  className?: string;
  onNavigate?: (view: string) => void;
}

function ArchNode({
  x,
  y,
  w,
  h,
  title,
  sub,
  view,
  nodeId,
  className,
  onNavigate,
}: ArchNodeProps): JSX.Element {
  const clickable = Boolean(view && onNavigate);
  return (
    <g
      className={`schematic-node ${className ?? ""}`}
      data-node={nodeId}
      onClick={clickable ? () => onNavigate!(view!) : undefined}
      style={{ cursor: clickable ? "pointer" : "default" }}
    >
      <rect className="schematic-bx" x={x} y={y} width={w} height={h} rx={9} />
      <text className="schematic-nt" x={x + 13} y={y + 24}>
        {title}
      </text>
      {sub ? (
        <text className="schematic-ns" x={x + 13} y={y + 42}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function GrpLabel({ x, y, children }: { x: number; y: number; children: string }): JSX.Element {
  return (
    <text className="schematic-grp" x={x} y={y}>
      {children}
    </text>
  );
}

function FlowPath({
  d,
  dashed,
  edgeId,
}: {
  d: string;
  dashed?: boolean;
  edgeId?: string;
}): JSX.Element {
  return (
    <path
      className={`schematic-flow ${dashed ? "schematic-flow-dash" : ""}`}
      data-edge={edgeId}
      d={d}
      markerEnd="url(#schematic-arr)"
    />
  );
}

function FlowLabel({
  x,
  y,
  children,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
}): JSX.Element {
  return (
    <text className="schematic-fl" x={x} y={y} textAnchor={anchor}>
      {children}
    </text>
  );
}

export function FactoryArchitectureDiagram({
  stats,
  onNavigate,
  statusLabel,
}: {
  stats: FactoryArchitectureStats;
  onNavigate: (view: string) => void;
  statusLabel?: string;
}): JSX.Element {
  const nav = onNavigate;

  return (
    <section aria-label="Factory architecture">
      <SchematicSectionTitle className="mt-[26px] mb-2.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-secondary">
        <span>Architecture — click any box</span>
        {statusLabel ? (
          <span className="font-mono text-[11px] font-semibold normal-case tracking-normal text-schematic-accent">
            {statusLabel}
          </span>
        ) : null}
      </SchematicSectionTitle>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 -10 1044 674"
          className="schematic-arch w-full min-w-[760px]"
          role="img"
          aria-label="Software factory harness diagram"
        >
          <defs>
            <marker
              id="schematic-arr"
              viewBox="0 0 10 10"
              refX={9}
              refY={5}
              markerWidth={7}
              markerHeight={7}
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="schematic-head" />
            </marker>
          </defs>

          <rect className="schematic-container" x={12} y={20} width={1020} height={628} rx={16} />
          <GrpLabel x={16} y={4}>
            HARNESS — runs in your factory · each turn is ephemeral
          </GrpLabel>

          <ArchNode
            x={32}
            y={72}
            w={128}
            h={56}
            title="Gateway"
            sub="telegram · openclaw · web"
            view="gateway"
            nodeId="gateway"
            onNavigate={nav}
          />
          <FlowPath d="M160 100 L192 100" edgeId="e-gw-wm" />
          <ArchNode
            x={192}
            y={72}
            w={144}
            h={56}
            title="Working memory"
            sub="assembled per turn"
            view="skills"
            nodeId="wm"
            onNavigate={nav}
          />

          <rect className="schematic-loopbox" x={370} y={56} width={168} height={166} rx={12} />
          <GrpLabel x={384} y={48}>
            LOOP
          </GrpLabel>
          <ArchNode
            x={384}
            y={72}
            w={140}
            h={50}
            title="LLM agent"
            sub="reason"
            view="tasks"
            nodeId="llm"
            onNavigate={nav}
          />
          <ArchNode
            x={384}
            y={152}
            w={140}
            h={52}
            title="Tools"
            sub="policy · execute…"
            view="trace-inspector"
            nodeId="tools"
            onNavigate={nav}
          />
          <FlowPath d="M448 122 L448 152" />
          <FlowPath d="M470 152 L470 122" />
          <FlowLabel x={456} y={141}>
            act
          </FlowLabel>
          <FlowPath d="M336 100 L370 100" edgeId="e-wm-loop" />
          <FlowPath d="M538 100 L558 106" />
          <FlowLabel x={542} y={93}>
            reply
          </FlowLabel>
          <ArchNode
            x={558}
            y={84}
            w={104}
            h={52}
            title="Reply"
            sub="→ back to you"
            view="live-chat"
            nodeId="reply"
            onNavigate={nav}
          />
          <path
            className="schematic-flow"
            data-edge="e-reply-gw"
            d="M610 84 C610 40 596 34 566 34 L130 34 C104 34 96 44 96 72"
            markerEnd="url(#schematic-arr)"
          />
          <FlowLabel x={348} y={28} anchor="middle">
            reply, out the same gateway
          </FlowLabel>
          <path
            className="schematic-flow schematic-flow-dash"
            data-edge="e-reply-save"
            d="M650 136 C660 150 660 200 660 600 L430 600"
            markerEnd="url(#schematic-arr)"
          />
          <FlowLabel x={668} y={214}>
            save chats
          </FlowLabel>

          <path
            className="schematic-gate schematic-node"
            data-node="gate"
            d="M264 250 L340 296 L264 342 L188 296 Z"
            onClick={() => nav("skills")}
            style={{ cursor: "pointer" }}
          />
          <text className="schematic-nt" x={264} y={292} textAnchor="middle" style={{ pointerEvents: "none" }}>
            Context gate
          </text>
          <text className="schematic-ns" x={264} y={310} textAnchor="middle" style={{ pointerEvents: "none" }}>
            {stats.gateAuto} auto · {stats.gateGated} gated
          </text>
          <FlowPath d="M264 250 L264 128" dashed edgeId="e-gate-wm" />
          <FlowLabel x={274} y={196}>
            only if needed
          </FlowLabel>

          <GrpLabel x={40} y={404}>
            MEMORY — three pillars
          </GrpLabel>
          <rect className="schematic-memgroup" x={28} y={414} width={600} height={128} rx={12} />
          <FlowPath d="M148 452 L246 336" dashed edgeId="e-gate-proc" />
          <FlowPath d="M340 452 L272 344" dashed edgeId="e-gate-sem" />
          <FlowPath d="M542 452 L286 338" dashed edgeId="e-gate-epi" />
          <FlowLabel x={356} y={392} anchor="middle">
            the gate reads all three
          </FlowLabel>
          <ArchNode
            x={44}
            y={452}
            w={208}
            h={72}
            title="Procedural"
            sub={`how to act · registry · ${stats.skillCount} skill(s)`}
            view="skills"
            nodeId="procedural"
            onNavigate={nav}
          />
          <ArchNode
            x={264}
            y={452}
            w={204}
            h={72}
            title="Semantic"
            sub={`durable facts · ${stats.factCount} facts`}
            view="memory"
            nodeId="semantic"
            onNavigate={nav}
          />
          <ArchNode
            x={480}
            y={452}
            w={132}
            h={72}
            title="Episodic"
            sub={`${stats.episodeCount} episodes`}
            view="telemetry"
            nodeId="episodic"
            onNavigate={nav}
          />

          <ArchNode
            x={44}
            y={576}
            w={384}
            h={52}
            title={`Consolidation · every ${stats.consolidateEvery} exchanges`}
            sub={`${stats.consolidatePending}/${stats.consolidateEvery * 2} queued → distilled into facts`}
            view="skills"
            nodeId="consolidation"
            onNavigate={nav}
          />
          <FlowPath d="M340 576 L340 528" edgeId="e-consol-sem" />
          <FlowLabel x={350} y={560}>
            distill
          </FlowLabel>

          <rect className="schematic-container schematic-container-ops" x={736} y={40} width={280} height={372} rx={14} />
          <GrpLabel x={752} y={64}>
            LLM OPS — offline improvement loop
          </GrpLabel>
          <FlowLabel x={752} y={80}>
            observes each run · improves the agent
          </FlowLabel>
          <path
            className="schematic-flow"
            data-edge="e-reply-trace"
            d="M660 104 C700 100 726 100 752 106"
            markerEnd="url(#schematic-arr)"
          />
          <FlowLabel x={688} y={96}>
            each turn
          </FlowLabel>
          <ArchNode
            x={752}
            y={92}
            w={250}
            h={50}
            title="Trace"
            sub={`${stats.traceFiles} file(s) · always on`}
            view="audit"
            nodeId="trace"
            onNavigate={nav}
          />
          <FlowPath d="M878 142 L878 156" />
          <ArchNode
            x={752}
            y={156}
            w={250}
            h={50}
            title="Eval"
            sub="deterministic + judge"
            view="qc-dashboard"
            nodeId="eval"
            onNavigate={nav}
          />
          <FlowPath d="M878 206 L878 220" />
          <ArchNode
            x={752}
            y={220}
            w={250}
            h={50}
            title="Release gate"
            sub={stats.evalPass ?? "run eval suite"}
            view="qc-runs"
            nodeId="release-gate"
            onNavigate={nav}
          />
          <FlowPath d="M878 270 L878 284" />
          <ArchNode
            x={752}
            y={284}
            w={250}
            h={50}
            title="Release"
            sub="new prompt · model · config"
            view="deployments"
            nodeId="release"
            onNavigate={nav}
          />
          <path
            className="schematic-flow schematic-flow-dash"
            d="M752 312 C712 324 698 352 676 358"
            markerEnd="url(#schematic-arr)"
          />
          <FlowLabel x={596} y={346} anchor="end">
            improved prompt + config
          </FlowLabel>
        </svg>
      </div>
    </section>
  );
}
