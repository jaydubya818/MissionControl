/**
 * Schedules / cron UI (OpenClaw Studio parity - Phase 4).
 * Lists Convex scheduled jobs; enable/disable, Run now, Remove. Optional create flow.
 * Advanced: run policy (idle/freshness/SLA/debounce), priority, conflict group.
 */

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useToast } from "./Toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Clock, Play, Trash2, Plus, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import { PageHeader } from "./components/PageHeader";

const JOB_TYPE_LABELS: Record<string, string> = {
  test_suite: "Test suite",
  qc_run: "QC run",
  workflow: "Workflow",
  hybrid: "Hybrid",
  mission_prompt: "Mission prompt",
};

const RUN_POLICY_LABELS: Record<string, string> = {
  standard: "Standard",
  run_if_idle: "Run if idle",
  run_if_not_run_since: "Freshness",
  run_at_least_per_period: "SLA",
  skip_if_last_run_within: "Debounce",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Normal",
  4: "Background",
};

function formatNextRun(ts: number): string {
  const now = Date.now();
  if (ts <= now) return "Due now";
  const mins = Math.round((ts - now) / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round((ts - now) / 3_600_000);
  return `in ${hours}h`;
}

function priorityTone(p: number): StatusBadgeProps["tone"] {
  if (p === 1) return "error";
  if (p === 2) return "warning";
  if (p === 4) return "neutral";
  return "info";
}

function JobCard({
  job,
  onToggleEnabled,
  onRunNow,
  onEdit,
  onRemove,
}: {
  job: Doc<"scheduledJobs">;
  onToggleEnabled: () => void;
  onRunNow: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const policyResult = useQuery(api.scheduledJobs.evaluatePolicy, { id: job._id });
  const policy = (job.runPolicy ?? "standard") as string;
  const priority = job.priority ?? 3;

  return (
    <Card className="p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-[13.5px] text-ink truncate">{job.name}</p>
          <StatusBadge tone="neutral">
            {RUN_POLICY_LABELS[policy] ?? policy}
          </StatusBadge>
          <StatusBadge tone={priorityTone(priority)}>
            {PRIORITY_LABELS[priority] ?? `P${priority}`}
          </StatusBadge>
          {job.conflictGroup && (
            <span className="text-xs text-ink-muted">Group: {job.conflictGroup}</span>
          )}
        </div>
        <p className="text-[12.5px] text-ink-muted mt-0.5">
          {JOB_TYPE_LABELS[job.jobType] ?? job.jobType} · <span className="font-mono">{job.cronExpression}</span>
          {job.lastRun != null && (
            <> · Last run {new Date(job.lastRun).toLocaleString()}</>
          )}
        </p>
        {policyResult && !policyResult.allowed && policy !== "standard" && (
          <p className="text-[12.5px] text-warn mt-0.5" title={policyResult.reason}>
            Policy: {policyResult.reason}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-ink-muted flex items-center gap-1">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          {formatNextRun(job.nextRun)}
        </span>
        <Button size="sm" variant="outline" className="h-7" onClick={onToggleEnabled} title={job.enabled ? "Disable" : "Enable"}>
          {job.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={onRunNow} title="Run now">
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-err hover:bg-err-soft hover:text-err" onClick={onRemove} title="Remove">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

type RunPolicyType = "standard" | "run_if_idle" | "run_if_not_run_since" | "run_at_least_per_period" | "skip_if_last_run_within";

export function SchedulesView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCron, setCreateCron] = useState("*/5 * * * *");
  const [createRunPolicy, setCreateRunPolicy] = useState<RunPolicyType>("standard");
  const [createPeriodSeconds, setCreatePeriodSeconds] = useState(86400);
  const [createMinRuns, setCreateMinRuns] = useState(3);
  const [createDebounceSeconds, setCreateDebounceSeconds] = useState(600);
  const [createPriority, setCreatePriority] = useState<number>(3);
  const [createConflictGroup, setCreateConflictGroup] = useState("");
  const [removeId, setRemoveId] = useState<Id<"scheduledJobs"> | null>(null);
  const [editJob, setEditJob] = useState<Doc<"scheduledJobs"> | null>(null);

  const jobs = useQuery(api.scheduledJobs.list, { projectId: projectId ?? undefined, limit: 100 });
  const createJob = useMutation(api.scheduledJobs.create);
  const updateJob = useMutation(api.scheduledJobs.update);
  const setEnabled = useMutation(api.scheduledJobs.setEnabled);
  const runNow = useMutation(api.scheduledJobs.runNow);
  const remove = useMutation(api.scheduledJobs.remove);
  const { toast } = useToast();

  const buildPolicyParams = () => {
    if (createRunPolicy === "run_if_not_run_since")
      return { periodSeconds: createPeriodSeconds };
    if (createRunPolicy === "run_at_least_per_period")
      return { periodSeconds: createPeriodSeconds, minRuns: createMinRuns };
    if (createRunPolicy === "skip_if_last_run_within")
      return { debounceSeconds: createDebounceSeconds };
    return undefined;
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast("Name is required", true);
      return;
    }
    try {
      await createJob({
        projectId: projectId ?? undefined,
        name: createName.trim(),
        jobType: "mission_prompt",
        cronExpression: createCron.trim(),
        createdBy: "operator",
        runPolicy: createRunPolicy,
        runPolicyParams: buildPolicyParams(),
        priority: createPriority,
        conflictGroup: createConflictGroup.trim() || undefined,
      });
      toast("Schedule created");
      setCreateOpen(false);
      setCreateName("");
      setCreateCron("*/5 * * * *");
      setCreateRunPolicy("standard");
      setCreatePriority(3);
      setCreateConflictGroup("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", true);
    }
  };

  const handleRemove = async () => {
    if (!removeId) return;
    try {
      await remove({ id: removeId });
      toast("Schedule removed");
      setRemoveId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Remove failed", true);
    }
  };

  if (!jobs) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader title="Schedules" />
        <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-3" aria-label="Loading schedules">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface-2" />
          <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface-2" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Schedules"
        description="Convex scheduled jobs. For per-agent cron (OpenClaw Gateway), use OpenClaw Studio."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.7} />
            Add schedule
          </Button>
        }
      />
      <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">

      <div className="space-y-3">
        {jobs.length === 0 && (
          <EmptyState
            icon={Clock}
            title="No schedules yet"
            description="Add one to run mission prompts or other jobs on a cron."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" strokeWidth={1.7} />
                Add schedule
              </Button>
            }
          />
        )}
        {jobs.map((job) => (
          <JobCard
            key={job._id}
            job={job}
            onToggleEnabled={async () => {
              try {
                await setEnabled({ id: job._id, enabled: !job.enabled });
                toast(job.enabled ? "Disabled" : "Enabled");
              } catch (e) {
                toast(e instanceof Error ? e.message : "Failed", true);
              }
            }}
            onRunNow={async () => {
              try {
                const out = await runNow({ id: job._id });
                if (out && "skipped" in out && out.skipped) {
                  toast(out.reason ?? "Skipped by policy", true);
                } else {
                  toast("Run triggered");
                }
              } catch (e) {
                toast(e instanceof Error ? e.message : "Run failed", true);
              }
            }}
            onEdit={() => setEditJob(job)}
            onRemove={() => setRemoveId(job._id)}
          />
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add schedule</DialogTitle>
            <DialogDescription>
              Create a Convex scheduled job. Use <code className="text-xs">*/5 * * * *</code> for every 5 minutes. Set run policy and priority for advanced behavior.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label className="mb-1.5">Name</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Daily mission prompt"
              />
            </div>
            <div>
              <Label className="mb-1.5">Cron (e.g. */5 * * * *)</Label>
              <Input
                value={createCron}
                onChange={(e) => setCreateCron(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <Label className="mb-1.5">Run policy</Label>
              <Select value={createRunPolicy} onValueChange={(v) => setCreateRunPolicy(v as RunPolicyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["standard", "run_if_idle", "run_if_not_run_since", "run_at_least_per_period", "skip_if_last_run_within"] as const).map((p) => (
                    <SelectItem key={p} value={p}>{RUN_POLICY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createRunPolicy === "run_if_not_run_since" && (
              <div>
                <Label className="mb-1.5">Period (seconds)</Label>
                <Input
                  type="number"
                  value={createPeriodSeconds}
                  onChange={(e) => setCreatePeriodSeconds(Number(e.target.value) || 86400)}
                />
              </div>
            )}
            {createRunPolicy === "run_at_least_per_period" && (
              <>
                <div>
                  <Label className="mb-1.5">Period (seconds)</Label>
                  <Input
                    type="number"
                    value={createPeriodSeconds}
                    onChange={(e) => setCreatePeriodSeconds(Number(e.target.value) || 86400)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5">Min runs per period</Label>
                  <Input
                    type="number"
                    value={createMinRuns}
                    onChange={(e) => setCreateMinRuns(Number(e.target.value) || 1)}
                  />
                </div>
              </>
            )}
            {createRunPolicy === "skip_if_last_run_within" && (
              <div>
                <Label className="mb-1.5">Debounce (seconds)</Label>
                <Input
                  type="number"
                  value={createDebounceSeconds}
                  onChange={(e) => setCreateDebounceSeconds(Number(e.target.value) || 600)}
                />
              </div>
            )}
            <div>
              <Label className="mb-1.5">Priority</Label>
              <Select value={String(createPriority)} onValueChange={(v) => setCreatePriority(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((p) => (
                    <SelectItem key={p} value={String(p)}>{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5">Conflict group (optional)</Label>
              <Input
                value={createConflictGroup}
                onChange={(e) => setCreateConflictGroup(e.target.value)}
                placeholder="e.g. heavy"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editJob && (
        <EditJobDialog
          job={editJob}
          onClose={() => setEditJob(null)}
          onSave={async (updates) => {
            try {
              await updateJob({ id: editJob._id, ...updates });
              toast("Schedule updated");
              setEditJob(null);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Update failed", true);
            }
          }}
        />
      )}

      {/* Remove confirmation */}
      <Dialog open={!!removeId} onOpenChange={(o) => !o && setRemoveId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove schedule</DialogTitle>
            <DialogDescription>This will delete the scheduled job. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </main>
  );
}

function EditJobDialog({
  job,
  onClose,
  onSave,
}: {
  job: Doc<"scheduledJobs">;
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    cronExpression?: string;
    runPolicy?: RunPolicyType;
    runPolicyParams?: Record<string, number>;
    priority?: number;
    conflictGroup?: string;
  }) => void;
}) {
  const [name, setName] = useState(job.name);
  const [cronExpression, setCronExpression] = useState(job.cronExpression);
  const [runPolicy, setRunPolicy] = useState<RunPolicyType>((job.runPolicy as RunPolicyType) ?? "standard");
  const [periodSeconds, setPeriodSeconds] = useState(
    (job.runPolicyParams as { periodSeconds?: number } | undefined)?.periodSeconds ?? 86400
  );
  const [minRuns, setMinRuns] = useState(
    (job.runPolicyParams as { minRuns?: number } | undefined)?.minRuns ?? 3
  );
  const [debounceSeconds, setDebounceSeconds] = useState(
    (job.runPolicyParams as { debounceSeconds?: number } | undefined)?.debounceSeconds ?? 600
  );
  const [priority, setPriority] = useState(job.priority ?? 3);
  const [conflictGroup, setConflictGroup] = useState(job.conflictGroup ?? "");

  const buildParams = () => {
    if (runPolicy === "run_if_not_run_since") return { periodSeconds };
    if (runPolicy === "run_at_least_per_period") return { periodSeconds, minRuns };
    if (runPolicy === "skip_if_last_run_within") return { debounceSeconds };
    return undefined;
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit schedule</DialogTitle>
          <DialogDescription>Update run policy, priority, and conflict group.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label className="mb-1.5">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5">Cron</Label>
            <Input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label className="mb-1.5">Run policy</Label>
            <Select value={runPolicy} onValueChange={(v) => setRunPolicy(v as RunPolicyType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["standard", "run_if_idle", "run_if_not_run_since", "run_at_least_per_period", "skip_if_last_run_within"] as const).map((p) => (
                  <SelectItem key={p} value={p}>{RUN_POLICY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {runPolicy === "run_if_not_run_since" && (
            <div>
              <Label className="mb-1.5">Period (seconds)</Label>
              <Input type="number" value={periodSeconds} onChange={(e) => setPeriodSeconds(Number(e.target.value) || 86400)} />
            </div>
          )}
          {runPolicy === "run_at_least_per_period" && (
            <>
              <div>
                <Label className="mb-1.5">Period (seconds)</Label>
                <Input type="number" value={periodSeconds} onChange={(e) => setPeriodSeconds(Number(e.target.value) || 86400)} />
              </div>
              <div>
                <Label className="mb-1.5">Min runs per period</Label>
                <Input type="number" value={minRuns} onChange={(e) => setMinRuns(Number(e.target.value) || 1)} />
              </div>
            </>
          )}
          {runPolicy === "skip_if_last_run_within" && (
            <div>
              <Label className="mb-1.5">Debounce (seconds)</Label>
              <Input type="number" value={debounceSeconds} onChange={(e) => setDebounceSeconds(Number(e.target.value) || 600)} />
            </div>
          )}
          <div>
            <Label className="mb-1.5">Priority</Label>
            <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((p) => (
                  <SelectItem key={p} value={String(p)}>{PRIORITY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">Conflict group</Label>
            <Input value={conflictGroup} onChange={(e) => setConflictGroup(e.target.value)} placeholder="e.g. heavy" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                name,
                cronExpression,
                runPolicy,
                runPolicyParams: buildParams(),
                priority,
                conflictGroup: conflictGroup.trim() || undefined,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
