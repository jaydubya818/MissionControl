import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface ScheduleViewProps {
  projectId: Id<"projects"> | null;
}

export function ScheduleView({ projectId }: ScheduleViewProps) {
  const [name, setName] = useState("Nightly Hybrid Validation");
  const [jobType, setJobType] = useState("hybrid");
  const [targetId, setTargetId] = useState("placeholder-target-id");
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [showTargetId, setShowTargetId] = useState(true);

  const jobs = useQuery((api as any).scheduledJobs.list, { projectId: projectId ?? undefined, enabledOnly: false, limit: 50 });
  const create = useMutation((api as any).scheduledJobs.create);
  const setEnabled = useMutation((api as any).scheduledJobs.setEnabled);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
        <p className="text-sm text-muted-foreground">Manage recurring test, QC, workflow, and hybrid executions.</p>
      </header>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input 
            className="h-9 rounded-md border border-input bg-background px-3 text-sm" 
            placeholder="Job name"
            value={name} 
            onChange={(e) => setName(e.target.value)} 
          />
          <select 
            className="h-9 rounded-md border border-input bg-background px-3 text-sm" 
            value={jobType} 
            onChange={(e) => {
              const newType = e.target.value;
              setJobType(newType);
              setShowTargetId(newType !== "mission_prompt");
              if (newType === "mission_prompt") {
                setName("Nightly Mission Prompt");
                setCronExpression("0 3 * * *");
              }
            }}
          >
            <option value="test_suite">test_suite</option>
            <option value="qc_run">qc_run</option>
            <option value="workflow">workflow</option>
            <option value="hybrid">hybrid</option>
            <option value="mission_prompt">mission_prompt</option>
          </select>
          {showTargetId && (
            <input 
              className="h-9 rounded-md border border-input bg-background px-3 text-sm" 
              placeholder="Target ID"
              value={targetId} 
              onChange={(e) => setTargetId(e.target.value)} 
            />
          )}
          <input 
            className="h-9 rounded-md border border-input bg-background px-3 text-sm" 
            placeholder="Cron expression (e.g., */15 * * * *)"
            value={cronExpression} 
            onChange={(e) => setCronExpression(e.target.value)} 
          />
        </div>
        {jobType === "mission_prompt" && (
          <div className="text-xs text-muted-foreground bg-primary/10 border border-primary/20 rounded-md p-3">
            <p className="font-medium text-primary mb-1">Mission Prompt Job</p>
            <p>This job will automatically generate mission-aligned tasks using AI. No target ID required. Recommended schedule: <code className="px-1 py-0.5 bg-white/5 rounded text-[0.65rem]">0 3 * * *</code> (daily at 3 AM)</p>
          </div>
        )}
        <Button
          onClick={() =>
            create({
              projectId: projectId ?? undefined,
              name,
              jobType,
              cronExpression,
              targetId: showTargetId ? targetId : undefined,
              autoRerunFlaky: jobType !== "mission_prompt",
              enabled: true,
              createdBy: "operator",
            })
          }
        >
          Create Scheduled Job
        </Button>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-2">
        <h3 className="font-medium">Jobs</h3>
        <div className="space-y-2">
          {(jobs ?? []).map((job: any) => (
            <div key={job._id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{job.name}</div>
                <div className="text-xs text-muted-foreground">
                  {job.jobType} · {job.cronExpression} · next {new Date(job.nextRun).toLocaleString()}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEnabled({ id: job._id, enabled: !job.enabled })}>
                {job.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
