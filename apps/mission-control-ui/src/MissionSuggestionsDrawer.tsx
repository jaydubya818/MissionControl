import { useEffect, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Plus, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MissionSuggestionsDrawerProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

type TaskSuggestion = {
  title: string;
  description: string;
  type:
    | "CONTENT"
    | "SOCIAL"
    | "EMAIL_MARKETING"
    | "CUSTOMER_RESEARCH"
    | "SEO_RESEARCH"
    | "ENGINEERING"
    | "DOCS"
    | "OPS";
  priority: 1 | 2 | 3 | 4;
  suggestedAssignee?: string;
  reasoning: string;
};

const PRIORITY_LABELS: Record<number, { label: string; classes: string }> = {
  1: { label: "Critical", classes: "text-red-500" },
  2: { label: "High", classes: "text-amber-500" },
  3: { label: "Normal", classes: "text-blue-500" },
  4: { label: "Low", classes: "text-muted-foreground" },
};

const TYPE_CLASSES: Record<string, string> = {
  CONTENT: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  SOCIAL: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  EMAIL_MARKETING: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  CUSTOMER_RESEARCH: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  SEO_RESEARCH: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  ENGINEERING: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  DOCS: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  OPS: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

export function MissionSuggestionsDrawer({ projectId, onClose }: MissionSuggestionsDrawerProps) {
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdTasks, setCreatedTasks] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reversePrompt = useAction(api.mission.reversePrompt);
  const createTask = useMutation(api.tasks.create);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setSuggestions([]);

    try {
      const result = await reversePrompt({
        projectId: projectId ?? undefined,
        autoCreate: false,
        maxSuggestions: 3,
      });
      setSuggestions(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate suggestions");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateTask = async (suggestion: TaskSuggestion, index: number) => {
    try {
      await createTask({
        projectId: projectId ?? undefined,
        title: suggestion.title,
        description: `${suggestion.description}\n\n**Mission Alignment:** ${suggestion.reasoning}`,
        type: suggestion.type,
        priority: suggestion.priority,
        source: "MISSION_PROMPT",
      });
      setCreatedTasks((prev) => new Set(prev).add(index));
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  const handleCreateAll = async () => {
    for (let i = 0; i < suggestions.length; i++) {
      if (!createdTasks.has(i)) {
        await handleCreateTask(suggestions[i], i);
      }
    }
  };

  useEffect(() => {
    void handleGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[620px] max-w-[92vw] p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-6 py-4 text-left">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-primary/20 bg-primary/10 p-2">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle>Mission-Aligned Tasks</SheetTitle>
                <SheetDescription>
                  Suggested tasks to move current mission goals forward.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-4 px-6 py-5">
              {isGenerating && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Generating mission-aligned task suggestions...
                  </p>
                </div>
              )}

              {error && (
                <Card className="border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-destructive"
                    onClick={handleGenerate}
                  >
                    Try again
                  </Button>
                </Card>
              )}

              {!isGenerating && suggestions.length === 0 && !error && (
                <Card className="p-8 text-center">
                  <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="mb-4 text-sm text-muted-foreground">No suggestions available yet.</p>
                  <Button size="sm" onClick={handleGenerate}>Generate Suggestions</Button>
                </Card>
              )}

              {!isGenerating && suggestions.length > 0 && (
                <div className="space-y-3">
                  {suggestions.map((suggestion, index) => {
                    const isCreated = createdTasks.has(index);
                    const priorityInfo = PRIORITY_LABELS[suggestion.priority];

                    return (
                      <Card key={index} className="p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="mb-1 text-sm font-semibold text-foreground">
                              {suggestion.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={TYPE_CLASSES[suggestion.type] ?? "bg-muted text-muted-foreground border-border"}
                              >
                                {suggestion.type.replace(/_/g, " ")}
                              </Badge>
                              <span className={`text-xs font-medium ${priorityInfo.classes}`}>
                                {priorityInfo.label}
                              </span>
                              {suggestion.suggestedAssignee && (
                                <span className="text-xs text-muted-foreground">
                                  → {suggestion.suggestedAssignee}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant={isCreated ? "secondary" : "outline"}
                            size="icon"
                            disabled={isCreated}
                            onClick={() => handleCreateTask(suggestion, index)}
                            aria-label={isCreated ? "Task created" : "Create task"}
                          >
                            {isCreated ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                          {suggestion.description}
                        </p>

                        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                          <p className="mb-1 text-xs font-semibold text-foreground">Mission Alignment</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {suggestion.reasoning}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {!isGenerating && suggestions.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <Button variant="ghost" size="sm" onClick={handleGenerate}>
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleCreateAll}
                disabled={createdTasks.size === suggestions.length}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create All ({suggestions.length - createdTasks.size})
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
