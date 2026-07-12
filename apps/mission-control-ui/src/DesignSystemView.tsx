import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import {
  RiskBadge,
  ScoreBadge,
  StatusBadge,
  TrendBadge,
} from "./components/factory/badges";
import {
  SwatchBook,
  Type,
  PanelsTopLeft,
  Tags,
  Workflow,
  Wand2,
} from "lucide-react";

const VISUAL_PILLARS = [
  {
    title: "State before decoration",
    description: "The UI should answer what is happening and what needs attention before it tries to impress anyone.",
  },
  {
    title: "One recognizable language",
    description: "Every page should look like Mission Control, even when new agents or tools generate parts of it.",
  },
  {
    title: "Prototype before complexity",
    description: "Design intent gets locked visually before backend complexity and implementation drift expand.",
  },
];

interface TokenSwatch {
  label: string;
  token: string;
  swatch: string;
}

const SURFACE_TOKENS: TokenSwatch[] = [
  { label: "App", token: "app", swatch: "bg-app" },
  { label: "Rail", token: "rail", swatch: "bg-rail" },
  { label: "Surface 1", token: "surface-1", swatch: "bg-surface-1" },
  { label: "Surface 2", token: "surface-2", swatch: "bg-surface-2" },
  { label: "Surface 3", token: "surface-3", swatch: "bg-surface-3" },
  { label: "Line", token: "line", swatch: "bg-line" },
  { label: "Line strong", token: "line-strong", swatch: "bg-line-strong" },
];

const INK_TOKENS: TokenSwatch[] = [
  { label: "Ink", token: "ink", swatch: "bg-ink" },
  { label: "Ink secondary", token: "ink-secondary", swatch: "bg-ink-secondary" },
  { label: "Ink muted", token: "ink-muted", swatch: "bg-ink-muted" },
  { label: "Action", token: "act", swatch: "bg-act" },
  { label: "Action ink", token: "act-ink", swatch: "bg-act-ink" },
];

const STATUS_TOKENS: TokenSwatch[] = [
  { label: "OK", token: "ok / ok-soft", swatch: "bg-ok" },
  { label: "Warn", token: "warn / warn-soft", swatch: "bg-warn" },
  { label: "Error", token: "err / err-soft", swatch: "bg-err" },
  { label: "Info", token: "info-accent / info-soft", swatch: "bg-info-accent" },
];

const RISK_TOKENS: TokenSwatch[] = [
  { label: "Risk low", token: "risk-low", swatch: "bg-risk-low" },
  { label: "Risk medium", token: "risk-medium", swatch: "bg-risk-medium" },
  { label: "Risk high", token: "risk-high", swatch: "bg-risk-high" },
  { label: "Risk critical", token: "risk-critical", swatch: "bg-risk-critical" },
];

const WORKFLOW_STEPS = [
  {
    title: "Lock the visual contract",
    detail: "Use docs/software-factory/UI_STYLE_GUIDE.md as the shared source of truth for surfaces, typography, status color, and anti-patterns.",
  },
  {
    title: "Generate or redesign from references",
    detail: "Borrow patterns and hierarchy from references without cloning them. Original composition is the requirement.",
  },
  {
    title: "Approve the prototype",
    detail: "Do not let backend work race ahead of a visual direction that still feels generic or unstable.",
  },
  {
    title: "Implement with factory primitives",
    detail: "PageHeader, DataTable, MetricBlock, EmptyState, and the badge set are the base layer; views style through v2 tokens only.",
  },
];

function SwatchGrid({ tokens }: { tokens: TokenSwatch[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tokens.map((token) => (
        <div key={token.label} className="rounded-lg border border-line bg-surface-2 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 shrink-0 rounded-lg border border-line ${token.swatch}`} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-ink">{token.label}</div>
              <div className="truncate font-mono text-[11.5px] text-ink-muted">{token.token}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DesignSystemView() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Design DNA"
        description="Mission Control's shared visual contract. The v2 token system and factory primitives keep redesigns, generated pages, and component work consistent."
        icon={<SwatchBook size={16} strokeWidth={1.7} aria-hidden />}
        status={<StatusBadge tone="neutral">v2 tokens</StatusBadge>}
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card className="p-5">
            <div className="text-[15px] font-semibold text-ink">
              Generated apps look the same when design intent stays implicit.
            </div>
            <div className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">
              Mission Control has an explicit design contract so new pages, redesigns, and agent-generated UI all inherit the same visual language instead of drifting into generic AI dashboards.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge tone="neutral">Design contract</StatusBadge>
              <StatusBadge tone="neutral">Transferable between agents</StatusBadge>
              <StatusBadge tone="neutral">Prototype-first</StatusBadge>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-[15px] font-semibold text-ink">
              <code className="font-mono text-[13px]">UI_STYLE_GUIDE.md</code> is the source of truth.
            </div>
            <div className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
              It captures surfaces, typography scale, status and badge rules, table density, control styles, motion limits, and accessibility requirements in agent-readable form. Tokens live in <code className="font-mono text-[12px]">src/index.css</code>; primitives in <code className="font-mono text-[12px]">src/components/factory/</code>.
            </div>
            <div className="mt-4 inline-flex rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary">
              Shared with future generators and redesign flows
            </div>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {VISUAL_PILLARS.map((pillar) => (
            <Card key={pillar.title} className="p-5">
              <div className="text-[15px] font-semibold text-ink">{pillar.title}</div>
              <div className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">{pillar.description}</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Type size={15} strokeWidth={1.7} aria-hidden className="text-ink-secondary" />
              <div className="text-[15px] font-semibold text-ink">Typography</div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                <div className="text-[12.5px] font-medium text-ink-secondary">Sans — Inter</div>
                <div className="mt-2 font-sans-v2 text-[26px] font-semibold leading-tight tracking-tight text-ink">
                  Mission Control
                </div>
                <div className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
                  <code className="font-mono text-[12px]">font-sans-v2</code> — UI copy at 26 / 19 / 15 / 13.5 / 12.5 / 11.5px. Calm, readable, dense when needed.
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                <div className="text-[12.5px] font-medium text-ink-secondary">Mono — JetBrains Mono</div>
                <div className="mt-2 font-mono-v2 text-[15px] text-ink">
                  task_9f3a · score 92 · sha 8af1dff
                </div>
                <div className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
                  <code className="font-mono text-[12px]">font-mono-v2</code> — reserved for code, hashes, ids, keys, scores, and terminal output.
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <PanelsTopLeft size={15} strokeWidth={1.7} aria-hidden className="text-ink-secondary" />
              <div className="text-[15px] font-semibold text-ink">Surfaces and lines</div>
            </div>
            <div className="mt-4">
              <SwatchGrid tokens={SURFACE_TOKENS} />
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <div className="text-[15px] font-semibold text-ink">Ink and action</div>
            <div className="mt-4">
              <SwatchGrid tokens={INK_TOKENS} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-[15px] font-semibold text-ink">Status and risk</div>
            <div className="mt-4 space-y-3">
              <SwatchGrid tokens={STATUS_TOKENS} />
              <SwatchGrid tokens={RISK_TOKENS} />
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Tags size={15} strokeWidth={1.7} aria-hidden className="text-ink-secondary" />
            <div className="text-[15px] font-semibold text-ink">Factory badges</div>
          </div>
          <div className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
            StatusBadge, RiskBadge, ScoreBadge, and TrendBadge from <code className="font-mono text-[12px]">components/factory/badges</code> replace the legacy chip and neon badge variants.
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">neutral</StatusBadge>
            <StatusBadge tone="success">success</StatusBadge>
            <StatusBadge tone="warning">warning</StatusBadge>
            <StatusBadge tone="error">error</StatusBadge>
            <StatusBadge tone="info">info</StatusBadge>
            <RiskBadge level="LOW" />
            <RiskBadge level="MEDIUM" />
            <RiskBadge level="HIGH" />
            <RiskBadge level="CRITICAL" />
            <ScoreBadge score={94} />
            <ScoreBadge score={78} />
            <ScoreBadge score={52} />
            <TrendBadge multiplier={1.33} />
            <TrendBadge multiplier={0.82} />
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Workflow size={15} strokeWidth={1.7} aria-hidden className="text-ink-secondary" />
              <div className="text-[15px] font-semibold text-ink">Migration workflow</div>
            </div>
            <div className="mt-4 space-y-3">
              {WORKFLOW_STEPS.map((step, index) => (
                <div key={step.title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 font-mono text-[12.5px] font-medium text-ink-secondary">
                    {index + 1}
                  </div>
                  <div className="min-w-0 rounded-lg border border-line bg-surface-2 px-4 py-3">
                    <div className="text-[13.5px] font-semibold text-ink">{step.title}</div>
                    <div className="mt-1 text-[13.5px] leading-relaxed text-ink-secondary">{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Wand2 size={15} strokeWidth={1.7} aria-hidden className="text-ink-secondary" />
              <div className="text-[15px] font-semibold text-ink">Applied to Mission Control</div>
            </div>
            <div className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                The shell, home, pipeline, docs, projects, and chat surfaces inherit one shared visual language instead of evolving independently.
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                The UI has a reviewable design contract, which means future redesigns can be original without becoming inconsistent.
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                The next maturity step is to let skills and generators consume the style guide automatically when creating new pages or features.
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Recommendation</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">
              Any new screen, redesign prompt, or component conversion should reference the UI style guide first. That is how we keep Mission Control from drifting into whatever the model has seen most recently.
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-secondary">
              Design contract first, UI generation second
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
