import { useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Bot, CalendarDays, Flag, Layers3, Link2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseDateInputValue } from "@/lib/dateInput";

const TASK_TYPES = [
  "CONTENT",
  "SOCIAL",
  "EMAIL_MARKETING",
  "CUSTOMER_RESEARCH",
  "SEO_RESEARCH",
  "ENGINEERING",
  "DOCS",
  "OPS",
] as const;

const PRIORITIES = [
  { value: 1, label: "Critical" },
  { value: 2, label: "High" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Low" },
] as const;

export function CreateTaskModal({
  projectId,
  defaultWorkOrderId,
  onClose,
  onCreated,
}: {
  projectId: Id<"projects"> | null;
  defaultWorkOrderId?: Id<"workOrders">;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("ENGINEERING");
  const [priority, setPriority] = useState(3);
  const [dueAt, setDueAt] = useState<string>("");
  const [assigneeIds, setAssigneeIds] = useState<Id<"agents">[]>([]);
  const [workOrderId, setWorkOrderId] = useState<Id<"workOrders"> | null>(
    defaultWorkOrderId ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const workOrders = useQuery(
    api.workOrders.list,
    projectId ? { projectId, limit: 200 } : "skip"
  );
  const missions = useQuery(
    api.missions.list,
    projectId ? { projectId, limit: 200 } : "skip"
  );
  const createTask = useAction(api.tasks.create);
  const selectedWorkOrder = workOrders?.find((item) => item._id === workOrderId);
  const parentMission = missions?.find(
    (mission) => mission._id === selectedWorkOrder?.missionId
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createTask({
        projectId: projectId ?? undefined,
        workOrderId: workOrderId ?? undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        dueAt: parseDateInputValue(dueAt) ?? undefined,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        idempotencyKey: `ui-create:${Date.now()}`,
        source: "DASHBOARD",
        createdBy: "HUMAN",
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
    setSubmitting(false);
  };

  const toggleAssignee = (id: Id<"agents">) => {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            Add work to the queue with clear routing, priority, and due-date context so agents can execute without guesswork.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.7fr)]">
            <div className="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Task brief</div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add enough context that the next operator or agent knows the goal, constraints, and expected outcome."
                  rows={5}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Routing</div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-work-order">Parent Work Order</Label>
                  <Select
                    value={workOrderId ?? "UNGOVERNED"}
                    onValueChange={(value) =>
                      setWorkOrderId(
                        value === "UNGOVERNED"
                          ? null
                          : (value as Id<"workOrders">)
                      )
                    }
                  >
                    <SelectTrigger id="task-work-order">
                      <SelectValue placeholder="Select a Work Order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNGOVERNED">
                        Create as Ungoverned Inbox
                      </SelectItem>
                      {workOrders?.map((workOrder) => (
                        <SelectItem key={workOrder._id} value={workOrder._id}>
                          {workOrder.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11.5px] leading-relaxed text-ink-muted">
                    Link this Task to a Work Order when it is part of governed factory delivery.
                    Tasks created without a Work Order remain in Ungoverned Inbox until organized.
                  </p>
                </div>

                {selectedWorkOrder ? (
                  <div
                    className="rounded-lg border border-line bg-surface-1 p-3 text-[11.5px]"
                    aria-label="Selected Work Order context"
                  >
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <Link2 className="h-3.5 w-3.5" aria-hidden />
                      {selectedWorkOrder.title}
                    </div>
                    <dl className="mt-2 grid grid-cols-[76px_1fr] gap-x-2 gap-y-1 text-ink-muted">
                      <dt>Mission</dt><dd className="text-ink-secondary">{parentMission?.title ?? "No parent Mission"}</dd>
                      <dt>Repository</dt><dd className="truncate text-ink-secondary">{selectedWorkOrder.repository ?? "Not declared"}</dd>
                      <dt>Risk</dt><dd className="text-ink-secondary">{selectedWorkOrder.riskLevel}</dd>
                      <dt>State</dt><dd className="text-ink-secondary">{selectedWorkOrder.state.replace(/_/g, " ")}</dd>
                    </dl>
                  </div>
                ) : (
                  <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-[11.5px] text-ink-secondary">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                    <span>Work Order required before execution.</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="task-type">Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger id="task-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((taskType) => (
                        <SelectItem key={taskType} value={taskType}>
                          {taskType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-priority">Priority</Label>
                  <Select
                    value={String(priority)}
                    onValueChange={(value) => setPriority(Number(value))}
                  >
                    <SelectTrigger id="task-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="task-due">Due date</Label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="task-due"
                      type="date"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      className="w-full pl-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {agents && agents.length > 0 && (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                <Label>Assignees</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {(agents as Doc<"agents">[]).map((agent) => {
                  const selected = assigneeIds.includes(agent._id);
                  return (
                    <Button
                      key={agent._id}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className="h-9 gap-2 rounded-lg px-3"
                      onClick={() => toggleAssignee(agent._id)}
                    >
                      <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span>{agent.name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
