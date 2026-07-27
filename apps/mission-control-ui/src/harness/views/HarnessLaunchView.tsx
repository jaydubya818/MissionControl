import { useMutation, useQuery } from "convex/react";
import { Rocket } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessAutomatePanel } from "../components/HarnessAutomatePanel";
import { HarnessVerificationProof } from "../components/HarnessVerificationProof";
import { Button } from "@/components/ui/button";

export function HarnessLaunchView({ projectId }: { projectId: Id<"projects"> | null }): JSX.Element {
  const runs = useQuery(api.factory.workflows.list, {
    projectId: projectId ?? undefined,
    limit: 20,
  });
  const schedule = useMutation(api.factory.workflows.schedule);

  const handleRun = async (skillName: string) => {
    await schedule({
      projectId: projectId ?? undefined,
      skillName,
      schedule: "manual",
      idempotencyKey: `launch-${skillName}-${Date.now()}`,
      actorId: "harness-ui",
    });
  };

  return (
    <HarnessPage
      title="Launch / Workflows"
      description="Skill → cloud sandbox. Model-agnostic runs with full logs for optimization."
      icon={<Rocket className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
        <HarnessAutomatePanel projectId={projectId} skillName="code-review" schedule="0 9 * * 1" />

        <div className="flex flex-wrap gap-2">
          {["code-review", "architecture-sweep", "mutation-testing"].map((skill) => (
            <Button key={skill} variant="outline" size="sm" onClick={() => void handleRun(skill)}>
              Run {skill}
            </Button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2">Skill</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {!runs ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-ink-muted">
                    Loading…
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-ink-muted">
                    No workflow runs yet.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r._id} className="border-b border-line/60">
                    <td className="px-4 py-2 text-ink">{r.skillName}</td>
                    <td className="px-4 py-2 text-ink-muted">{r.agentModel ?? "—"}</td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2 text-ink-muted">{r.schedule ?? "manual"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <HarnessVerificationProof />
      </div>
    </HarnessPage>
  );
}
