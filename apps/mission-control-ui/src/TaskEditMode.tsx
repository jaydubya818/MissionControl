import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { formatDateInputValue, parseDateInputValue } from "@/lib/dateInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Pencil, Save, Loader2 } from "lucide-react";

const DEFAULT_REVIEW_ITEMS = [
  "Acceptance criteria verified",
  "Tests or manual checks passed",
  "Evidence, risks, and limitations recorded",
];

function getRequiredOutputFields(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const outputContract = (metadata as Record<string, unknown>).outputContract;
  if (!outputContract || typeof outputContract !== "object" || Array.isArray(outputContract)) {
    return [];
  }
  const requiredFields = (outputContract as Record<string, unknown>).requiredFields;
  return Array.isArray(requiredFields)
    ? requiredFields.filter(
        (field): field is string => typeof field === "string" && field.trim().length > 0
      )
    : [];
}

function validateRequiredOutputFields(content: string, requiredFields: string[]): string | null {
  if (requiredFields.length === 0) return null;
  if (!content.trim()) {
    return `Deliverable evidence must be JSON with required fields: ${requiredFields.join(", ")}.`;
  }
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Deliverable evidence must be a JSON object.";
    }
    const missing = requiredFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(parsed, field)
    );
    return missing.length > 0
      ? `Deliverable evidence is missing required fields: ${missing.join(", ")}.`
      : null;
  } catch {
    return `Deliverable evidence must be valid JSON with required fields: ${requiredFields.join(", ")}.`;
  }
}

interface TaskEditModeProps {
  task: Doc<"tasks">;
  onSave: () => void;
  onCancel: () => void;
  /** Shown when save fails (e.g. invalid status transition). Falls back to alert if omitted. */
  onSaveError?: (message: string) => void;
}

export function TaskEditMode({ task, onSave, onCancel, onSaveError }: TaskEditModeProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [type, setType] = useState(task.type);
  const [estimatedCost, setEstimatedCost] = useState(task.estimatedCost || 0);
  const [dueAt, setDueAt] = useState(formatDateInputValue(task.dueAt));
  const [assigneeIds, setAssigneeIds] = useState<Id<"agents">[]>(task.assigneeIds || []);
  const [workPlanText, setWorkPlanText] = useState(
    task.workPlan?.bullets.join("\n") ?? ""
  );
  const [deliverableSummary, setDeliverableSummary] = useState(
    task.deliverable?.summary ?? ""
  );
  const [deliverableContent, setDeliverableContent] = useState(
    task.deliverable?.content ?? ""
  );
  const [reviewItems, setReviewItems] = useState(
    task.reviewChecklist?.items ??
      DEFAULT_REVIEW_ITEMS.map((label) => ({ label, checked: false }))
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requiredOutputFields = getRequiredOutputFields(task.metadata);

  const updateTask = useMutation(api.tasks.update);
  const agents = useQuery(api.agents.listAll, { projectId: task.projectId });
  const allowedTransitions = useQuery(api.tasks.getAllowedTransitionsForHuman);

  const handleSave = async () => {
    setSaveError(null);
    if (status === "REVIEW") {
      const contractError = validateRequiredOutputFields(
        deliverableContent,
        requiredOutputFields
      );
      if (contractError) {
        setSaveError(contractError);
        onSaveError?.(contractError);
        return;
      }
    }

    setSaving(true);
    try {
      const workPlanBullets = workPlanText
        .split("\n")
        .map((bullet) => bullet.trim())
        .filter(Boolean);
      await updateTask({
        taskId: task._id,
        title,
        description,
        priority,
        status,
        type,
        estimatedCost,
        dueAt: parseDateInputValue(dueAt),
        assigneeIds,
        workPlan:
          workPlanBullets.length > 0
            ? {
                bullets: workPlanBullets,
                estimatedCost: estimatedCost || undefined,
              }
            : undefined,
        deliverable:
          deliverableSummary.trim() || deliverableContent.trim()
            ? {
                summary: deliverableSummary.trim() || undefined,
                content: deliverableContent.trim() || undefined,
                artifactIds: task.deliverable?.artifactIds ?? [],
              }
            : undefined,
        reviewChecklist: {
          type: task.reviewChecklist?.type ?? "SUBMISSION",
          items: reviewItems,
        },
        idempotencyKey: `task-editor:${task._id}:${status}:${Date.now()}`,
      });
      onSave();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update task";
      setSaveError(message);
      onSaveError?.(message);
    } finally {
      setSaving(false);
    }
  };

  const statuses: Array<Doc<"tasks">["status"]> = [
    task.status,
    ...(((allowedTransitions?.[task.status] ?? []) as Array<Doc<"tasks">["status"]>)),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const types: Array<Doc<"tasks">["type"]> = [
    "CONTENT",
    "SOCIAL",
    "EMAIL_MARKETING",
    "CUSTOMER_RESEARCH",
    "SEO_RESEARCH",
    "ENGINEERING",
    "DOCS",
    "OPS",
  ];
  const priorities: Array<Doc<"tasks">["priority"]> = [1, 2, 3, 4];

  return (
    <div className="p-5 flex flex-col gap-5 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
        <h3 className="m-0 text-base font-semibold text-foreground flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Edit task
        </h3>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            size="sm"
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
      {saveError && (
        <div
          id="task-edit-save-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {saveError}
        </div>
      )}

      <div className="flex flex-col gap-5">
        <div className="space-y-2">
          <Label htmlFor="task-edit-title">Title *</Label>
          <Input
            id="task-edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-edit-description">Description</Label>
          <Textarea
            id="task-edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Detailed task description…"
            className="resize-y min-h-[120px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Doc<"tasks">["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={String(priority)}
              onValueChange={(v) => setPriority(Number(v) as Doc<"tasks">["priority"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    P{p} —{" "}
                    {p === 1 ? "Critical" : p === 2 ? "High" : p === 3 ? "Normal" : "Low"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as Doc<"tasks">["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-edit-due">Due date</Label>
          <div className="flex items-center gap-2">
            <Input
              id="task-edit-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
            {dueAt && (
              <Button type="button" variant="ghost" size="sm" className="h-9 px-2.5 text-xs" onClick={() => setDueAt("")}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Assigned agents ({assigneeIds.length})</Label>
          <div className="flex flex-wrap gap-2 p-3 rounded-md border border-border bg-muted/20 min-h-[3rem]">
            {agents?.map((agent) => {
              const isSelected = assigneeIds.includes(agent._id);
              return (
                <Button
                  key={agent._id}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 text-xs",
                    isSelected && "ring-2 ring-primary/30"
                  )}
                  onClick={() => {
                    if (isSelected) {
                      setAssigneeIds(assigneeIds.filter((id) => id !== agent._id));
                    } else {
                      setAssigneeIds([...assigneeIds, agent._id]);
                    }
                  }}
                >
                  {agent.emoji ? <span className="mr-1">{agent.emoji}</span> : null}
                  {agent.name}
                </Button>
              );
            })}
            {agents?.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">No agents in project.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-edit-cost">Estimated cost ($)</Label>
          <Input
            id="task-edit-cost"
            type="number"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(Number(e.target.value))}
            step="0.01"
            min={0}
          />
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <Label htmlFor="task-edit-work-plan">Work plan</Label>
          <Textarea
            id="task-edit-work-plan"
            value={workPlanText}
            onChange={(event) => setWorkPlanText(event.target.value)}
            rows={4}
            placeholder={"One plan item per line (3–6 required before starting)"}
            className="resize-y"
          />
          <p className="text-xs text-muted-foreground">
            Required to move an assigned task into progress.
          </p>
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          {requiredOutputFields.length > 0 && (
            <Card className="mb-4 border-border bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground">
                Workflow output contract
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Required JSON fields: {requiredOutputFields.join(", ")}. Submission is
                validated before the task can enter Review.
              </p>
            </Card>
          )}
          <Label htmlFor="task-edit-deliverable-summary">Deliverable summary</Label>
          <Textarea
            id="task-edit-deliverable-summary"
            value={deliverableSummary}
            onChange={(event) => setDeliverableSummary(event.target.value)}
            rows={3}
            placeholder="What was produced, what changed, and the outcome"
            className="resize-y"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-edit-deliverable-content">Deliverable evidence</Label>
          <Textarea
            id="task-edit-deliverable-content"
            value={deliverableContent}
            onChange={(event) => setDeliverableContent(event.target.value)}
            rows={7}
            placeholder="Evidence, source links, test output, artifact paths, risks, and limitations"
            className="resize-y font-mono text-xs"
            aria-describedby={saveError ? "task-edit-save-error" : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Summary, evidence, and a checked review list are required before submission.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Review checklist</legend>
          {reviewItems.map((item, index) => (
            <label
              key={`${item.label}-${index}`}
              className="flex items-start gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(event) =>
                  setReviewItems((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, checked: event.target.checked }
                        : candidate
                    )
                  )
                }
                className="mt-0.5 h-4 w-4"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>

        <Card className="p-3 bg-muted/30 border-border/80">
          <p className="text-[0.7rem] text-muted-foreground space-y-1">
            <span className="block">
              <span className="font-medium text-foreground/90">Task ID:</span>{" "}
              <code className="text-[0.65rem]">{task._id}</code>
            </span>
            <span className="block">
              <span className="font-medium text-foreground/90">Created:</span>{" "}
              {new Date(task._creationTime).toLocaleString()}
            </span>
            {task.actualCost > 0 && (
              <span className="block">
                <span className="font-medium text-foreground/90">Actual cost:</span> $
                {task.actualCost.toFixed(2)}
              </span>
            )}
          </p>
        </Card>
      </div>
    </div>
  );
}
