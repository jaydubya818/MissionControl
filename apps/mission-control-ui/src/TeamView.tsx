import type { Id } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bot,
  Cloud,
  Code2,
  Megaphone,
  Palette,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface TeamViewProps {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: MainView) => void;
}

interface RoleCardData {
  name: string;
  role: string;
  description: string;
  skills: string[];
  icon: LucideIcon;
}

interface TeamSection {
  id: string;
  label: string;
  description: string;
  members: RoleCardData[];
}

const SOFIE: RoleCardData = {
  name: "Sofie",
  role: "Chief of Staff",
  description: "Coordinates delegation, keeps execution tidy, and turns rough intent into accountable motion across the fleet.",
  skills: ["Orchestration", "Clarity", "Delegation"],
  icon: ShieldCheck,
};

const TEAM_SECTIONS: TeamSection[] = [
  {
    id: "operations",
    label: "Operations layer",
    description: "Infrastructure, QA, and the control paths that keep the system stable under load.",
    members: [
      {
        name: "Charlie",
        role: "Infrastructure Engineer",
        description: "Owns automation, runtime reliability, and the machinery underneath day-to-day execution.",
        skills: ["Infrastructure", "Automation", "Reliability"],
        icon: Cloud,
      },
      {
        name: "Ralph",
        role: "Foreman / QA Manager",
        description: "Checks output quality, closes loops, and sends weak work back before it creates trust debt.",
        skills: ["Quality", "Monitoring", "Review"],
        icon: Wrench,
      },
    ],
  },
  {
    id: "signals",
    label: "Signal and output",
    description: "The layer that senses demand, shapes narrative, and turns signals into outward motion.",
    members: [
      {
        name: "Scout",
        role: "Trend Analyst",
        description: "Looks for leading indicators, opportunities, and changes in demand before they become obvious.",
        skills: ["Radar", "Research", "Signal quality"],
        icon: Search,
      },
      {
        name: "Quill The Artisan",
        role: "Content Writer",
        description: "Translates intent into clear, on-brand writing that feels deliberate instead of automated.",
        skills: ["Voice", "Narrative", "Editing"],
        icon: PenLine,
      },
      {
        name: "Pixel",
        role: "Thumbnail Designer",
        description: "Owns visual framing, promotional assets, and attention-shaping design work.",
        skills: ["Design", "Visual taste", "Brand consistency"],
        icon: Palette,
      },
      {
        name: "Echo",
        role: "Social Media Manager",
        description: "Pushes distribution, keeps channels active, and turns finished work into visible reach.",
        skills: ["Distribution", "Speed", "Audience"],
        icon: Megaphone,
      },
    ],
  },
  {
    id: "meta",
    label: "Meta layer",
    description: "Build, research, and product intelligence used to improve the system itself.",
    members: [
      {
        name: "Codex",
        role: "Lead Engineer",
        description: "Builds, fixes, and keeps the product moving toward something we would actually ship.",
        skills: ["Code", "Systems", "Launchability"],
        icon: Code2,
      },
      {
        name: "Violet",
        role: "Research Analyst",
        description: "Handles deep analysis, research synthesis, and the work needed before decisions become irreversible.",
        skills: ["Research", "Analysis", "Context"],
        icon: Sparkles,
      },
    ],
  },
];

function TeamMemberCard({ member, onNavigate }: { member: RoleCardData; onNavigate?: (view: MainView) => void }) {
  const Icon = member.icon;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary">
          <Icon size={16} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <div>
            <div className="text-[15px] font-semibold text-ink">{member.name}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-muted">{member.role}</div>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-secondary">{member.description}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {member.skills.map((skill) => (
              <StatusBadge key={skill} tone="neutral">
                {skill}
              </StatusBadge>
            ))}
          </div>
          {onNavigate ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onNavigate("agents")}>
                Open agents
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("org")}>
                Org chart
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function TeamView({ projectId: _projectId, onNavigate }: TeamViewProps) {
  const totalAgents = TEAM_SECTIONS.reduce((sum, section) => sum + section.members.length, 1);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Team"
        description="A readable map of who does what inside Mission Control so operators can understand ownership before they delegate work."
        eyebrow="Comms"
        icon={<Bot size={16} strokeWidth={1.7} />}
        status={<StatusBadge tone="neutral">{totalAgents} active roles</StatusBadge>}
        actions={
          <div className="flex gap-2">
            {onNavigate ? (
              <>
                <Button variant="outline" size="sm" onClick={() => onNavigate("org")}>
                  Org chart
                </Button>
                <Button size="sm" onClick={() => onNavigate("agents")}>
                  Open agents
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock label="Roles mapped" value={totalAgents} detail="Named responsibilities represented in the operating model" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Leadership" value={1} detail="Sofie remains the primary coordination layer for operator intent" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Execution bands" value={TEAM_SECTIONS.length} detail="Operations, signal/output, and meta-system work" />
          </Card>
          <Card className="p-4">
            <MetricBlock label="Design rule" value="Clear" detail="Every role needs an obvious reason to exist and a clear handoff boundary" />
          </Card>
        </div>

        <Card className="p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
            <div>
              <div className="text-[12.5px] font-medium text-ink-secondary">Operator brief</div>
              <h2 className="mt-2 text-[19px] font-semibold tracking-tight text-ink">
                An autonomous organization of AI agents that does real work with real accountability.
              </h2>
              <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">
                This page should help an operator understand responsibilities quickly. It is not a vanity gallery. If a role or
                section feels ornamental, it should be merged, renamed, or removed.
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4 text-[13.5px] leading-relaxed text-ink-secondary">
                Use Team to orient new operators, then move to Org Chart when you need direct reporting structure.
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4 text-[13.5px] leading-relaxed text-ink-secondary">
                Every role should map cleanly to a buyer, seller, or platform problem. If it does not, it is likely scope drift.
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-start gap-4 rounded-xl border border-line bg-surface-2 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-secondary">
              <SOFIE.icon size={16} strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink-secondary">Chief of staff</div>
              <div className="mt-1 text-[15px] font-semibold text-ink">{SOFIE.name}</div>
              <div className="text-[12.5px] text-ink-muted">{SOFIE.role}</div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-secondary">{SOFIE.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {SOFIE.skills.map((skill) => (
                  <StatusBadge key={skill} tone="neutral">
                    {skill}
                  </StatusBadge>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {TEAM_SECTIONS.map((section) => (
              <section key={section.id} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="text-[15px] font-semibold text-ink">{section.label}</div>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">{section.description}</p>
                <div className="grid gap-4 xl:grid-cols-2">
                  {section.members.map((member) => (
                    <TeamMemberCard key={member.name} member={member} onNavigate={onNavigate} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        {onNavigate ? (
          <Card className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[15px] font-semibold text-ink">Next step</div>
                <div className="mt-1 text-[13.5px] text-ink-secondary">
                  Move from role mapping into structure or staffing if the current operating model feels thin.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onNavigate("org")}>
                  Org chart
                </Button>
                <Button onClick={() => onNavigate("hiring")}>
                  Hiring
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
