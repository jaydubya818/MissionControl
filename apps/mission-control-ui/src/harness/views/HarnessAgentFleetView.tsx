import { useQuery } from "convex/react";
import { Bot } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessAgentFleetPanel } from "../components/HarnessAgentFleetPanel";
import { HarnessVerificationProof } from "../components/HarnessVerificationProof";

export function HarnessAgentFleetView({
  projectId,
}: {
  projectId: Id<"projects"> | null;
}): JSX.Element {
  const fleet = useQuery(api.factory.agentFleet.snapshot, {
    projectId: projectId ?? undefined,
    limit: 12,
  });

  return (
    <HarnessPage
      eyebrow="Async orchestration"
      title="Agent fleet"
      description="5–10 parallel cloud agents — isolated VMs, nested sub-agents, review queue, and stuck detection."
      icon={<Bot className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto max-w-[1000px] space-y-8 pb-4">
        {!fleet ? (
          <p className="text-sm text-ink-muted">Loading fleet…</p>
        ) : (
          <HarnessAgentFleetPanel agents={fleet.agents} summary={fleet.summary} />
        )}
        <HarnessVerificationProof />
      </div>
    </HarnessPage>
  );
}
