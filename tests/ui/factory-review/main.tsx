import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReviewEvidencePackage } from "../../../apps/mission-control-ui/src/controlPlane/ReviewEvidencePackage";
import { CreateFactoryMissionDialog } from "../../../apps/mission-control-ui/src/factoryExperience/CreateFactoryMissionDialog";
import { FactoryIntakePanel } from "../../../apps/mission-control-ui/src/factoryExperience/FactoryIntakePanel";
import { FactoryReplayPanel } from "../../../apps/mission-control-ui/src/factoryExperience/FactoryReplayPanel";
import { buildReviewPackage } from "../../../convex/lib/reviewPackage";
import "../../../apps/mission-control-ui/src/index.css";

const params = new URLSearchParams(window.location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") === "light" ? "light" : "dark");
const review = buildReviewPackage({
  now: 100,
  run: { _id: "fixture-attempt", runId: "fixture-attempt", status: "COMPLETED", workOrderRevisionNumber: 1,
    repositoryId: "fixture-repository", branch: "fixture/review", executionBaseSha: "base", headSha: "candidate",
    pullRequestUrl: "https://github.com/example/fixture/pull/1", pullRequestNumber: 1 },
  workOrder: { _id: "fixture-work-order", currentRevisionNumber: 1, verificationContract: { schemaVersion: 2 },
    acceptanceCriteria: [{ id: "persistence", title: "Persistence failure is visible", verificationMethod: "BROWSER" }] },
  currentVerification: { current: false, eligible: false, reasons: ["The latest independent browser verification has not passed."] },
  fileChanges: [{ repositoryPath: "src/app.tsx" }], rollbackApproach: "Revert the candidate after review.", expectedRepository: "example/fixture",
});

function Fixture() {
  const [open, setOpen] = useState(params.get("view") === "recipe");
  const [draft, setDraft] = useState<unknown>(null);
  const [operation, setOperation] = useState<unknown>(null);
  useEffect(() => {
    const capture = (event: Event) => setDraft((event as CustomEvent).detail);
    const captureOperation = (event: Event) => setOperation((event as CustomEvent).detail);
    window.addEventListener("fixture-draft", capture);
    window.addEventListener("fixture-operation", captureOperation);
    return () => { window.removeEventListener("fixture-draft", capture); window.removeEventListener("fixture-operation", captureOperation); };
  }, []);
  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
    <h1 className="mb-2 text-xl font-semibold">Factory component verification</h1>
    <p className="mb-5 text-sm text-muted-foreground">Real components with isolated fixture data. No live control plane or dispatch.</p>
    {params.get("view") === "recipe" ? <>
      <CreateFactoryMissionDialog projectId={"fixture-project" as never} open={open} onOpenChange={setOpen}
        experienceLevel="intermediate" initialRequest={params.get("request") ?? "Explain how authentication works; report findings only"} />
      {draft ? <><p role="status">Draft captured by the local fixture.</p><pre data-testid="captured-draft" className="whitespace-pre-wrap break-all">{JSON.stringify(draft)}</pre></> : null}
    </> : params.get("view") === "intake" ? <FactoryIntakePanel projectId={"fixture-project" as never} onOpenMission={() => {}} />
      : params.get("view") === "replay" ? <FactoryReplayPanel experimentId={"fixture-experiment" as never} experimentStatus="DRAFT" hasManifest canFreeze />
      : <ReviewEvidencePackage review={review} />}
    {operation ? <pre data-testid="captured-operation" className="whitespace-pre-wrap break-all">{JSON.stringify(operation)}</pre> : null}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
