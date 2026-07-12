import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { FolderKanban, Github, Orbit, RadioTower, Sparkles } from "lucide-react";

interface ProjectsViewProps {
  projectId: Id<"projects"> | null;
}

export function ProjectsView({ projectId }: ProjectsViewProps) {
  const projects = useQuery(api.projects.list);
  const [selectedProject, setSelectedProject] = useState<Id<"projects"> | null>(projectId);

  useEffect(() => {
    if (projectId) setSelectedProject(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!selectedProject && projects && projects.length > 0) {
      setSelectedProject(projects[0]._id);
    }
  }, [projects, selectedProject]);

  const totals = useMemo(() => {
    if (!projects) return null;
    return {
      total: projects.length,
      connected: projects.filter((project) => Boolean(project.githubRepo)).length,
      swarms: projects.filter((project) => Boolean(project.swarmConfig)).length,
    };
  }, [projects]);

  if (!projects || !totals) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
          <div className="h-24 animate-pulse rounded-xl border border-line bg-surface-2" />
          <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
            <div className="h-[520px] animate-pulse rounded-xl border border-line bg-surface-2" />
            <div className="h-[520px] animate-pulse rounded-xl border border-line bg-surface-2" />
          </div>
        </div>
      </main>
    );
  }

  const selectedProjectDoc = projects.find((project) => project._id === selectedProject) ?? null;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Projects"
        description="Operate every mission, repo, and swarm from a single view. Select a project to inspect readiness, agent staffing, and integration health."
        icon={<FolderKanban size={16} strokeWidth={1.7} />}
        status={
          <StatusBadge tone="neutral">{totals.total} tracked projects</StatusBadge>
        }
      />

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <MetricBlock
              label="Portfolio"
              value={totals.total}
              detail="Active project workspaces under Mission Control."
            />
          </Card>
          <Card className="p-5">
            <MetricBlock
              label="Connected repos"
              value={totals.connected}
              detail="Projects with a linked GitHub repository and branch context."
            />
          </Card>
          <Card className="p-5">
            <MetricBlock
              label="Swarm-ready"
              value={totals.swarms}
              detail="Projects that already define a swarm configuration."
            />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="text-[12.5px] font-medium text-ink-secondary">Project registry</div>
              <div className="mt-1 text-[15px] font-semibold text-ink">Choose where you want to operate</div>
            </div>
            <div className="space-y-3 p-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  isSelected={project._id === selectedProject}
                  onSelect={() => setSelectedProject(project._id)}
                />
              ))}
            </div>
          </Card>

          {selectedProjectDoc ? (
            <ProjectDetails project={selectedProjectDoc} />
          ) : (
            <Card className="flex min-h-[520px] items-center justify-center p-10 text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-muted">
                  <Sparkles size={16} strokeWidth={1.7} />
                </div>
                <div className="mt-4 text-[15px] font-semibold text-ink">Select a project</div>
                <div className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-secondary">
                  Use the registry on the left to inspect agent staffing, GitHub connectivity, and swarm configuration for the project you want to drive next.
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

interface ProjectCardProps {
  project: Doc<"projects">;
  isSelected: boolean;
  onSelect: () => void;
}

function ProjectCard({ project, isSelected, onSelect }: ProjectCardProps) {
  const stats = useQuery(api.projects.getStats, { projectId: project._id });
  const agents = useQuery(api.agents.list, { projectId: project._id });
  const activeAgents = agents?.filter((agent) => agent.status === "ACTIVE").length ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border px-4 py-4 text-left transition-colors duration-150",
        isSelected
          ? "border-line-strong bg-surface-2"
          : "border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2"
      )}
      aria-label={`Project ${project.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink">{project.name}</div>
          <div className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">
            {project.description || "No description yet. Define the operating scope for this project."}
          </div>
        </div>
        {project.githubRepo && (
          <Github size={14} strokeWidth={1.7} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatPill label="Tasks" value={stats?.tasks.total ?? 0} />
        <StatPill label="Active" value={activeAgents} />
        <StatPill label="Approvals" value={stats?.approvals.pending ?? 0} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.githubRepo && (
          <StatusBadge tone="neutral">Repo linked</StatusBadge>
        )}
        {project.swarmConfig && (
          <StatusBadge tone="success">Swarm configured</StatusBadge>
        )}
      </div>
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div className="text-[15px] font-semibold text-ink">{value}</div>
      <div className="text-[11.5px] text-ink-muted">{label}</div>
    </div>
  );
}

function ProjectDetails({ project }: { project: Doc<"projects"> }) {
  const agents = useQuery(api.agents.list, { projectId: project._id });
  const stats = useQuery(api.projects.getStats, { projectId: project._id });

  const activeAgents = agents?.filter((agent) => agent.status === "ACTIVE") ?? [];
  const pausedAgents = agents?.filter((agent) => agent.status === "PAUSED") ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-ink-secondary">Project detail</div>
            <div className="mt-2">
              <div className="text-[19px] font-semibold tracking-tight text-ink">{project.name}</div>
              <div className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">
                {project.description || "Add a project description so operators understand the project outcome, constraints, and current business purpose."}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {project.githubRepo && (
              <Button variant="outline" size="sm">
                <Github className="h-3.5 w-3.5" />
                {project.githubBranch || "main"}
              </Button>
            )}
            {project.swarmConfig && (
              <Button variant="outline" size="sm">
                <Orbit className="h-3.5 w-3.5" />
                Swarm live
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <MetricBlock
                label="Task load"
                value={stats?.tasks.total ?? 0}
                detail="Total tasks attached to this project."
              />
            </Card>
            <Card className="p-4">
              <MetricBlock
                label="Agent capacity"
                value={activeAgents.length}
                detail="Agents actively operating right now."
              />
            </Card>
            <Card className="p-4">
              <MetricBlock
                label="Approvals"
                value={stats?.approvals.pending ?? 0}
                detail="Human decisions still waiting in queue."
              />
            </Card>
          </div>

          <Card className="p-5">
            <div className="text-[12.5px] font-medium text-ink-secondary">Integration posture</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <IntegrationRow
                icon={<Github size={15} strokeWidth={1.7} />}
                label="Repository"
                value={project.githubRepo || "Not connected"}
                detail={project.githubRepo ? `Branch ${project.githubBranch || "main"}` : "Link a repository for release and code context."}
              />
              <IntegrationRow
                icon={<RadioTower size={15} strokeWidth={1.7} />}
                label="Webhook"
                value={project.githubWebhookSecret ? "Configured" : "Missing"}
                detail={project.githubWebhookSecret ? "Inbound repo events are enabled." : "Set a webhook secret if this project should react to GitHub events."}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-[12.5px] font-medium text-ink-secondary">Swarm settings</div>
            <div className="mt-3 space-y-3">
              {project.swarmConfig ? (
                <>
                  <IntegrationRow
                    icon={<Orbit size={15} strokeWidth={1.7} />}
                    label="Max agents"
                    value={String(project.swarmConfig.maxAgents)}
                    detail={project.swarmConfig.autoScale ? "Auto-scale is enabled." : "Capacity is fixed manually."}
                  />
                  <IntegrationRow
                    icon={<Sparkles size={15} strokeWidth={1.7} />}
                    label="Default model"
                    value={project.swarmConfig.defaultModel || "Claude Sonnet 4"}
                    detail="Primary runtime model for default assignments."
                  />
                </>
              ) : (
                <div className="rounded-xl border border-line bg-surface-2 px-4 py-4 text-[13.5px] leading-relaxed text-ink-secondary">
                  This project does not have swarm settings yet. Add one before expecting repeatable routing and capacity behavior.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-[12.5px] font-medium text-ink-secondary">Agent roster</div>
            <div className="mt-3 space-y-3">
              <RosterGroup title="Active agents" agents={activeAgents} emptyLabel="No active agents are currently assigned." />
              <RosterGroup title="Paused agents" agents={pausedAgents} emptyLabel="No paused agents." />
            </div>
          </Card>
        </div>
      </div>
    </Card>
  );
}

function IntegrationRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-ink-secondary">{icon}</span>
        <div className="min-w-0">
          <div className="text-[11.5px] text-ink-muted">{label}</div>
          <div className="mt-1 text-[13.5px] font-medium text-ink">{value}</div>
        </div>
      </div>
      <div className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{detail}</div>
    </div>
  );
}

function RosterGroup({
  title,
  agents,
  emptyLabel,
}: {
  title: string;
  agents: Doc<"agents">[];
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 text-[11.5px] text-ink-muted">{title}</div>
      {agents.length > 0 ? (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent._id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-3 text-[13px] font-semibold text-ink-secondary">
                {agent.emoji || agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-ink">{agent.name}</div>
                <div className="text-[12.5px] text-ink-muted">{agent.role}</div>
              </div>
              <StatusBadge tone="neutral">{agent.status.toLowerCase()}</StatusBadge>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13.5px] text-ink-secondary">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
