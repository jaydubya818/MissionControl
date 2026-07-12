import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/factory/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Trash2,
  X,
  Filter,
} from "lucide-react";

interface KanbanFiltersProps {
  projectId: Id<"projects"> | null;
  currentUserId: string;
  filters: {
    agents: string[];
    priorities: number[];
    types: string[];
  };
  onFiltersChange: (filters: {
    agents: string[];
    priorities: number[];
    types: string[];
  }) => void;
}

const PRIORITY_CONFIG: Record<number, { label: string; shortLabel: string }> = {
  1: { label: "Critical", shortLabel: "P1" },
  2: { label: "High", shortLabel: "P2" },
  3: { label: "Normal", shortLabel: "P3" },
};

const TOGGLE_ACTIVE = "border-line-strong bg-surface-2 text-ink";
const TOGGLE_INACTIVE =
  "border-line bg-surface-1 text-ink-secondary hover:text-ink hover:border-line-strong";

export function KanbanFilters({ projectId, currentUserId, filters, onFiltersChange }: KanbanFiltersProps) {
  const [selectedViewId, setSelectedViewId] = useState<string>("");

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const savedViews = useQuery(
    api.savedViews.list,
    projectId
      ? { projectId, ownerUserId: currentUserId, scope: "KANBAN" }
      : "skip"
  );

  const createSavedView = useMutation(api.savedViews.create);
  const removeSavedView = useMutation(api.savedViews.remove);

  const selectedView = savedViews?.find((view) => view._id === selectedViewId);

  if (!agents || !tasks) return null;

  const taskTypes = Array.from(new Set(tasks.map((t) => t.type))).sort();

  const toggleAgent = (agentId: string) => {
    const newAgents = filters.agents.includes(agentId)
      ? filters.agents.filter((id) => id !== agentId)
      : [...filters.agents, agentId];
    onFiltersChange({ ...filters, agents: newAgents });
  };

  const togglePriority = (priority: number) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((p) => p !== priority)
      : [...filters.priorities, priority];
    onFiltersChange({ ...filters, priorities: newPriorities });
  };

  const toggleType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    onFiltersChange({ ...filters, types: newTypes });
  };

  const clearFilters = () => {
    onFiltersChange({ agents: [], priorities: [], types: [] });
  };

  const hasFilters = filters.agents.length > 0 || filters.priorities.length > 0 || filters.types.length > 0;
  const activeCount = filters.agents.length + filters.priorities.length + filters.types.length;

  const handleSaveView = async () => {
    if (!projectId) {
      window.alert("Select a project before saving a view.");
      return;
    }
    const name = window.prompt("Saved view name", "Operator Focus");
    if (!name || !name.trim()) return;
    const isShared = window.confirm("Share this view with other operators in the project?");
    await createSavedView({
      projectId,
      ownerUserId: currentUserId,
      name: name.trim(),
      scope: "KANBAN",
      filters,
      isShared,
    });
  };

  const handleApplyView = (viewId: string) => {
    setSelectedViewId(viewId);
    const view = savedViews?.find((candidate) => candidate._id === viewId);
    if (!view) return;
    const nextFilters = view.filters as {
      agents?: string[];
      priorities?: number[];
      types?: string[];
    };
    onFiltersChange({
      agents: nextFilters.agents ?? [],
      priorities: nextFilters.priorities ?? [],
      types: nextFilters.types ?? [],
    });
  };

  const handleDeleteView = async () => {
    if (!selectedView) return;
    if (selectedView.ownerUserId !== currentUserId) {
      window.alert("Only the owner can delete this view.");
      return;
    }
    const confirmDelete = window.confirm(`Delete saved view "${selectedView.name}"?`);
    if (!confirmDelete) return;
    await removeSavedView({
      viewId: selectedView._id,
      ownerUserId: currentUserId,
    });
    setSelectedViewId("");
  };

  return (
    <div className="shrink-0 border-b border-line bg-app px-4 py-2">
      <div className="flex items-center gap-3 overflow-x-auto flex-nowrap">
        {/* Filter icon + active count */}
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={14} strokeWidth={1.6} className="text-ink-muted" />
          <span className="text-[11.5px] font-medium text-ink-muted">Filters</span>
          {activeCount > 0 && <StatusBadge tone="info">{activeCount}</StatusBadge>}
        </div>

        <div className="w-px h-5 bg-line shrink-0" />

        {/* Saved views */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={selectedViewId} onValueChange={handleApplyView}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Saved views…" />
            </SelectTrigger>
            <SelectContent>
              {savedViews?.map((view) => (
                <SelectItem key={view._id} value={view._id}>
                  {view.name}{view.isShared ? " (shared)" : ""}
                </SelectItem>
              ))}
              {(!savedViews || savedViews.length === 0) && (
                <SelectItem value="__none" disabled>No saved views</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs px-2.5 gap-1" onClick={handleSaveView}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
          {selectedView && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-err hover:text-err hover:bg-err-soft"
              onClick={handleDeleteView}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="w-px h-5 bg-line shrink-0" />

        {/* Priority */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11.5px] font-medium text-ink-muted">Priority</span>
          <div className="flex items-center gap-1">
            {([1, 2, 3] as const).map((priority) => {
              const isActive = filters.priorities.includes(priority);
              const config = PRIORITY_CONFIG[priority];
              return (
                <button
                  key={priority}
                  onClick={() => togglePriority(priority)}
                  title={config.label}
                  className={cn(
                    "h-8 px-3 rounded-lg text-xs font-medium border transition-colors duration-150",
                    isActive ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
                  )}
                >
                  {config.shortLabel}
                  {!isActive && (
                    <span className="ml-1 text-[11px] opacity-60 hidden sm:inline">{config.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-px h-5 bg-line shrink-0" />

        {/* Agents */}
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-medium text-ink-muted shrink-0">Agent</span>
          <div className="flex items-center gap-1 flex-nowrap">
            {agents.slice(0, 5).map((agent) => {
              const isActive = filters.agents.includes(agent._id);
              return (
                <button
                  key={agent._id}
                  onClick={() => toggleAgent(agent._id)}
                  title={agent.name}
                  className={cn(
                    "h-8 w-8 rounded-lg text-sm flex items-center justify-center transition-colors duration-150 border font-medium",
                    isActive ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
                  )}
                >
                  {agent.emoji || agent.name.charAt(0)}
                </button>
              );
            })}
            {agents.length > 5 && (
              <span className="text-[11px] text-ink-muted px-1">+{agents.length - 5}</span>
            )}
          </div>
        </div>

        {/* Type */}
        {taskTypes.length > 0 && (
          <>
            <div className="w-px h-5 bg-line shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-medium text-ink-muted shrink-0">Type</span>
              <div className="flex items-center gap-1 flex-nowrap">
                {taskTypes.slice(0, 4).map((type) => {
                  const isActive = filters.types.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className={cn(
                        "h-8 px-3 rounded-lg text-xs font-medium border transition-colors duration-150",
                        isActive ? TOGGLE_ACTIVE : TOGGLE_INACTIVE
                      )}
                    >
                      {type}
                    </button>
                  );
                })}
                {taskTypes.length > 4 && (
                  <span className="text-[11px] text-ink-muted px-1">+{taskTypes.length - 4}</span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-3 gap-1.5 ml-auto shrink-0"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
