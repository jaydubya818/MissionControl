import { useMutation, useQuery } from "convex/react";
import { Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { Button } from "@/components/ui/button";

export function HarnessChangeRiskView({ projectId }: { projectId: Id<"projects"> | null }): JSX.Element {
  const policy = useQuery(api.context.changeRisk.getActivePolicy, {
    projectId: projectId ?? undefined,
  });
  const defaults = useQuery(api.context.changeRisk.defaultRules, {});
  const upsert = useMutation(api.context.changeRisk.upsertPolicy);
  const [strictness, setStrictness] = useState(50);

  useEffect(() => {
    if (policy) setStrictness(policy.strictness);
  }, [policy]);

  const rules = policy?.rules ?? defaults ?? [];

  const save = async () => {
    await upsert({
      projectId: projectId ?? undefined,
      name: "Default change risk",
      strictness,
      rules: rules.map((r) => ({
        id: r.id,
        label: r.label,
        requireHuman: r.requireHuman,
        globPatterns: r.globPatterns,
      })),
      actorId: "harness-ui",
    });
  };

  return (
    <HarnessPage
      title="Change Risk"
      description="Policy gate: which PRs require human review vs agent-only merge (target 40–50% bypass)."
      icon={<Scale className="h-5 w-5 text-registry-accent" />}
      actions={
        <Button size="sm" onClick={() => void save()}>
          Save policy
        </Button>
      }
    >
      <div className="mx-auto max-w-[800px] space-y-6">
        <div>
          <label className="text-xs font-medium uppercase text-ink-muted">
            Strictness — permissive ↔ strict
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={strictness}
            onChange={(e) => setStrictness(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="mt-1 text-sm tabular-nums text-ink">{strictness}% human review bias</div>
        </div>

        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
              <div>
                <div className="text-sm font-medium text-ink">{r.label}</div>
                <div className="text-xs text-ink-muted">{r.globPatterns?.join(", ") ?? "All paths"}</div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  r.requireHuman ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok"
                }`}
              >
                {r.requireHuman ? "Human required" : "Agent OK"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </HarnessPage>
  );
}
