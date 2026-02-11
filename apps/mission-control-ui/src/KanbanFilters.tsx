import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const PRIORITY_CONFIG: Record<number, { label: string; shortLabel: string; activeClass: string }> = {
  1: { label: "Critical", shortLabel: "P1", activeClass: "bg-red-500 text-white border-red-500" },
  2: { label: "High", shortLabel: "P2", activeClass: "bg-orange-500 text-white border-orange-500" },
  3: { label: "Normal", shortLabel: "P3", activeClass: "bg-blue-500 text-white border-blue-500" },
};

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
    <div className="border-b border-border bg-card/50 px-4 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter icon + active count */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Filters</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </div>

        {/* Saved views */}
        <div className="flex items-center gap-1.5">
          <Select value={selectedViewId} onValueChange={handleApplyView}>
            <SelectTrigger className="h-7 w-[160px] text-xs">
              <SelectValue placeholder="Saved views" />
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
          <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={handleSaveView}>
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
          {selectedView && (
            <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 text-destructive hover:text-destructive" onClick={handleDeleteView}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Priority */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Priority:</span>
          {([1, 2, 3] as const).map((priority) => {
            const isActive = filters.priorities.includes(priority);
            const config = PRIORITY_CONFIG[priority];
            return (
              <button
                key={priority}
                onClick={() => togglePriority(priority)}
                className={cn(
                  "h-6 px-2.5 rounded-full text-[11px] font-medium border transition-colors",
                  isActive
                    ? config.activeClass
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {config.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Agents */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Agents:</span>
          <div className="flex items-center gap-1 flex-wrap max-w-[320px]">
            {agents.slice(0, 5).map((agent) => {
              const isActive = filters.agents.includes(agent._id);
              return (
                <button
                  key={agent._id}
                  onClick={() => toggleAgent(agent._id)}
                  title={agent.name}
                  className={cn(
                    "h-6 w-6 rounded-md text-xs flex items-center justify-center transition-colors border",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  {agent.emoji || "🤖"}
                </button>
              );
            })}
            {agents.length > 5 && (
              <span className="text-[10px] text-muted-foreground">+{agents.length - 5}</span>
            )}
          </div>
        </div>

        {/* Type */}
        {taskTypes.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Type:</span>
            <div className="flex items-center gap-1 flex-wrap max-w-[320px]">
              {taskTypes.slice(0, 4).map((type) => {
                const isActive = filters.types.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "h-6 px-2 rounded text-[11px] font-medium border transition-colors",
                      isActive
                        ? "bg-teal-600 text-white border-teal-600"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
              {taskTypes.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{taskTypes.length - 4}</span>
              )}
            </div>
          </div>
        )}

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-muted-foreground ml-auto"
            onClick={clearFilters}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
