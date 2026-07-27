import { GitBranch, Layers, RefreshCw, Shield } from "lucide-react";
import type { MainView } from "../../TopNav";
import { FactorySchematicOverview } from "@/components/schematic/FactorySchematicOverview";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessLoopsDiagram } from "../components/HarnessLoopsDiagram";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../../../convex/_generated/dataModel";

const LOOPS = [
  {
    id: "inner",
    title: "Inner loop",
    icon: Layers,
    when: "While agent works",
    items: ["Skills & plugins", "Unit tests", "Skill-lint", "Session hooks (pre-push)"],
    status: "active" as const,
  },
  {
    id: "outer",
    title: "Outer loop",
    icon: Shield,
    when: "At PR boundary",
    items: ["Change review", "Verifiers", "Mutation testing", "Change risk gate"],
    status: "partial" as const,
  },
  {
    id: "meta",
    title: "Meta loop",
    icon: RefreshCw,
    when: "Continuous",
    items: ["PR/issue mining", "Eval extraction", "Rule retirement", "Maintenance sweeps"],
    status: "pending" as const,
  },
];

export function HarnessLoopsView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}): JSX.Element {
  return (
    <HarnessPage
      title="Harness Loops"
      description="Inner, outer, and meta loops — plus AI developer workflows (ADW) that replace vague loop engineering."
      icon={<GitBranch className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-registry-accent/25 bg-registry-accent-soft/30 px-4 py-3">
          <p className="text-[13px] text-ink-secondary">
            <strong className="text-ink">ADW vs loops:</strong> Loops are one control-flow pattern inside a developer
            workflow — see the full software factory diagram.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-architect")}>
              Architect mode
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNavigate("harness-software-factory")}>
              Software factory
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <HarnessLoopsDiagram />
        </div>

        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <FactorySchematicOverview
            onNavigate={(v) => onNavigate(v as MainView)}
            projectId={projectId}
            scannedAt={Date.now()}
            title="Harness architecture"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {LOOPS.map((loop) => (
            <div key={loop.id} className="rounded-xl border border-line bg-surface-1 p-4">
              <div className="flex items-center gap-2">
                <loop.icon className="h-4 w-4 text-registry-accent" />
                <h3 className="font-semibold text-ink">{loop.title}</h3>
                <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] uppercase text-ink-muted">
                  {loop.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-secondary">{loop.when}</p>
              <ul className="mt-3 space-y-1 text-sm text-ink-secondary">
                {loop.items.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {loop.id === "outer" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onNavigate("harness-verifiers")}>
                      Verifiers
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onNavigate("harness-change-review")}>
                      Change Review
                    </Button>
                  </>
                )}
                {loop.id === "meta" && (
                  <Button size="sm" variant="outline" onClick={() => onNavigate("harness-meta-loop")}>
                    Meta inbox
                  </Button>
                )}
                {loop.id === "inner" && (
                  <Button size="sm" variant="outline" onClick={() => onNavigate("skills")}>
                    Registry
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </HarnessPage>
  );
}
