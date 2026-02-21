import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface ProjectsViewProps {
  projectId: Id<"projects"> | null;
}

export function ProjectsView({ projectId }: ProjectsViewProps) {
  const projects = useQuery(api.projects.list);
  const [selectedProject, setSelectedProject] = useState<Id<"projects"> | null>(
    projectId
  );

  // Sync selectedProject with projectId prop changes
  if (projectId !== selectedProject && projectId !== null) {
    setSelectedProject(projectId);
  }

  if (!projects) {
    return (
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="flex items-center justify-center h-full text-muted-foreground text-base">
          Loading projects...
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto bg-background p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mt-0 mb-1">Projects</h1>
        <p className="text-base text-muted-foreground mt-0">
          Manage repositories and agent swarms
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 mb-8">
        {projects.map((project) => (
          <ProjectCard
            key={project._id}
            project={project}
            isSelected={project._id === selectedProject}
            onSelect={() => setSelectedProject(project._id)}
          />
        ))}
      </div>

      {selectedProject && (
        <ProjectDetails projectId={selectedProject} />
      )}
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

  const activeAgents = agents?.filter((a) => a.status === "ACTIVE").length ?? 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "p-5 bg-card border-2 rounded-[10px] cursor-pointer transition-all duration-200 text-left",
        isSelected
          ? "border-primary ring-2 ring-primary/25"
          : "border-border"
      )}
      aria-label={`Project: ${project.name}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="text-[2rem]">📁</div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold text-foreground mb-1">{project.name}</div>
          {project.githubRepo && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="text-sm">⚡</span>
              {project.githubRepo}
            </div>
          )}
        </div>
      </div>

      {project.description && (
        <div className="text-sm text-muted-foreground leading-relaxed mb-4">{project.description}</div>
      )}

      <div className="flex gap-4 pt-3 border-t border-border">
        <div className="flex flex-col gap-1">
          <span className="text-xl font-semibold text-foreground">{stats?.tasks.total ?? 0}</span>
          <span className="text-xs text-muted-foreground">Tasks</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xl font-semibold text-foreground">
            {activeAgents}/{agents?.length ?? 0}
          </span>
          <span className="text-xs text-muted-foreground">Agents</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xl font-semibold text-foreground">{stats?.approvals.pending ?? 0}</span>
          <span className="text-xs text-muted-foreground">Approvals</span>
        </div>
      </div>

      {project.swarmConfig && (
        <div className="mt-3 py-2 px-3 bg-muted border border-border rounded-md text-xs text-muted-foreground">
          🤖 Swarm: {project.swarmConfig.maxAgents} max
          {project.swarmConfig.autoScale && " • Auto-scale"}
        </div>
      )}
    </button>
  );
}

interface ProjectDetailsProps {
  projectId: Id<"projects">;
}

function ProjectDetails({ projectId }: ProjectDetailsProps) {
  const project = useQuery(api.projects.get, { projectId });
  const agents = useQuery(api.agents.list, { projectId });

  if (!project) return null;

  const activeAgents = agents?.filter((a) => a.status === "ACTIVE") ?? [];
  const pausedAgents = agents?.filter((a) => a.status === "PAUSED") ?? [];

  return (
    <div className="mt-8 pt-8 border-t-2 border-border">
      <h2 className="text-2xl font-semibold text-foreground mt-0 mb-5">Agent Swarm Configuration</h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-base font-semibold text-foreground mb-3">Active Agents</div>
          <div className="flex flex-col gap-2">
            {activeAgents.length === 0 && (
              <div className="text-sm text-muted-foreground italic text-center p-3">No active agents</div>
            )}
            {activeAgents.map((agent) => (
              <AgentBadge key={agent._id} agent={agent} />
            ))}
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-base font-semibold text-foreground mb-3">Paused Agents</div>
          <div className="flex flex-col gap-2">
            {pausedAgents.length === 0 && (
              <div className="text-sm text-muted-foreground italic text-center p-3">No paused agents</div>
            )}
            {pausedAgents.map((agent) => (
              <AgentBadge key={agent._id} agent={agent} />
            ))}
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-base font-semibold text-foreground mb-3">GitHub Integration</div>
          <div className="flex flex-col gap-2">
            {project.githubRepo ? (
              <>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Repository:</span>
                  <span className="text-sm text-foreground font-medium">{project.githubRepo}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Branch:</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.githubBranch || "main"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Webhook:</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.githubWebhookSecret ? "✓ Configured" : "✗ Not set"}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic text-center p-3">Not connected to GitHub</div>
            )}
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-base font-semibold text-foreground mb-3">Swarm Settings</div>
          <div className="flex flex-col gap-2">
            {project.swarmConfig ? (
              <>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Max Agents:</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.swarmConfig.maxAgents}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Default Model:</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.swarmConfig.defaultModel || "Claude Sonnet 4"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-muted-foreground">Auto-scale:</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.swarmConfig.autoScale ? "✓ Enabled" : "✗ Disabled"}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic text-center p-3">No swarm configuration</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AgentBadgeProps {
  agent: Doc<"agents">;
}

function AgentBadge({ agent }: AgentBadgeProps) {
  const statusBgClass =
    agent.status === "PAUSED"
      ? "bg-amber-500"
      : agent.status === "QUARANTINED"
        ? "bg-red-500"
        : agent.status === "OFFLINE"
          ? "bg-slate-500"
          : "bg-emerald-500";

  return (
    <div className="flex items-center gap-2.5 p-2 bg-muted border border-border rounded-md">
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0",
          statusBgClass
        )}
      >
        {agent.emoji || agent.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{agent.name}</div>
        <div className="text-xs text-muted-foreground">{agent.role}</div>
      </div>
    </div>
  );
}
