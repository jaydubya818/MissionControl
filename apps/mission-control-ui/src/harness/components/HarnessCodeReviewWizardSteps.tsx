import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { MainView } from "../../TopNav";
import { Button } from "@/components/ui/button";
import { HarnessAutomatePanel } from "./HarnessAutomatePanel";
import { cn } from "@/lib/utils";

export interface WizardFinding {
  id: string;
  label: string;
  detail: string;
  selected: boolean;
}

export function HarnessCodeReviewWizardSteps({
  step,
  projectId,
  onNavigate,
}: {
  step: number;
  projectId?: Id<"projects"> | null;
  onNavigate?: (view: MainView) => void;
}): JSX.Element {
  const evidence = useQuery(api.factory.codeReviewWizard.gatherEvidence, {
    projectId: projectId ?? undefined,
  });
  const packages = useQuery(api.context.packages.listWithCurrentVersions, {});
  const defaultRules = useQuery(api.context.changeRisk.defaultRules, {});
  const upsertPolicy = useMutation(api.context.changeRisk.upsertPolicy);
  const generateVerifier = useMutation(api.context.verifiers.generateFromSkill);
  const schedule = useMutation(api.factory.workflows.schedule);
  const createMeta = useMutation(api.factory.metaLoop.create);

  const [findings, setFindings] = useState<WizardFinding[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [policyApplied, setPolicyApplied] = useState(false);
  const [verifierCreated, setVerifierCreated] = useState(false);
  const [metaScheduled, setMetaScheduled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (evidence?.findings && findings.length === 0) {
      setFindings(evidence.findings.map((f) => ({ ...f })));
    }
  }, [evidence, findings.length]);

  useEffect(() => {
    if (!selectedPackageId && packages?.[0]?._id) {
      setSelectedPackageId(packages[0]._id);
    }
  }, [packages, selectedPackageId]);

  if (step === 0) {
    if (!evidence) {
      return (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning PRs, CI, and QC…
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-muted">
          {evidence.prCount} PR checks · legible surfaces only (not chat logs)
        </p>
        <ul className="space-y-2">
          {evidence.findings.map((f) => (
            <li key={f.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-secondary">
              <span className="font-medium text-ink">{f.label}</span>
              <div className="text-xs text-ink-muted">{f.detail}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (step === 1) {
    return (
      <ul className="space-y-2">
        {findings.map((f) => (
          <li key={f.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={f.selected}
                onChange={(e) =>
                  setFindings((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, selected: e.target.checked } : x))
                  )
                }
                className="mt-1"
              />
              <span>
                <span className="font-medium text-ink">{f.label}</span>
                <div className="text-xs text-ink-muted">{f.detail}</div>
              </span>
            </label>
          </li>
        ))}
      </ul>
    );
  }

  if (step === 2) {
    const selected = findings.filter((f) => f.selected);
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-secondary">
          Codify {selected.length} finding(s) into an owned review skill in Registry.
        </p>
        <select
          value={selectedPackageId}
          onChange={(e) => setSelectedPackageId(e.target.value)}
          className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm"
        >
          {(packages ?? []).map((p) => (
            <option key={p._id} value={p._id}>
              {p.owner}/{p.displayName ?? p.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!selectedPackageId || busy}
          onClick={() => {
            setBusy(true);
            void generateVerifier({
              packageId: selectedPackageId as Id<"contextPackages">,
              actorId: "code-review-wizard",
            })
              .then(() => setVerifierCreated(true))
              .finally(() => setBusy(false));
          }}
        >
          {verifierCreated ? "Verifier created" : "Create verifier from skill"}
        </Button>
      </div>
    );
  }

  if (step === 3) {
    return (
      <HarnessAutomatePanel
        projectId={projectId ?? null}
        skillName="code-review"
        schedule="0 */6 * * *"
        onNavigate={onNavigate}
      />
    );
  }

  if (step === 4) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-secondary">
          Target 40–50% human-review bypass. Docs/harness paths auto-merge when CI passes.
        </p>
        <Button
          size="sm"
          disabled={busy || policyApplied}
          onClick={() => {
            setBusy(true);
            void upsertPolicy({
              projectId: projectId ?? undefined,
              name: "Code review wizard policy",
              strictness: 45,
              rules: defaultRules ?? [],
              actorId: "code-review-wizard",
            })
              .then(() => setPolicyApplied(true))
              .finally(() => setBusy(false));
          }}
        >
          {policyApplied ? "Policy applied" : "Apply default Change Risk policy"}
        </Button>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="space-y-2 text-sm text-ink-secondary">
        <p>Fast verifiers shift expensive agentic review left (~$0.30/day vs ~$25/PR).</p>
        {verifierCreated ? (
          <p className="text-registry-accent">Verifier linked from step 3.</p>
        ) : (
          <p className="text-ink-muted">Complete step 3 to create a verifier from your skill.</p>
        )}
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary">
          Schedule meta loop to mine PR comments and propose eval scenarios with lineage.
        </p>
        <Button
          size="sm"
          disabled={busy || metaScheduled}
          onClick={() => {
            setBusy(true);
            const key = `meta-loop-${Date.now()}`;
            void schedule({
              projectId: projectId ?? undefined,
              skillName: "meta-loop-pr-mining",
              schedule: "0 2 * * *",
              idempotencyKey: key,
            })
              .then(() =>
                createMeta({
                  projectId: projectId ?? undefined,
                  kind: "EVAL_SCENARIO",
                  title: "Boundary from PR mining",
                  summary: "Extract eval when mutation testing misses empty-input path",
                  sourceRef: evidence?.latestPrUrl ?? "PR-mining",
                  packageId: selectedPackageId
                    ? (selectedPackageId as Id<"contextPackages">)
                    : undefined,
                })
              )
              .then(() => setMetaScheduled(true))
              .finally(() => setBusy(false));
          }}
        >
          {metaScheduled ? "Meta loop scheduled" : "Schedule nightly meta loop"}
        </Button>
        <HarnessAutomatePanel
          projectId={projectId ?? null}
          skillName="code-review"
          schedule="0 8 * * 1"
          onNavigate={onNavigate}
        />
      </div>
    );
  }

  return (
    <p className={cn("text-sm text-ink-muted")}>Unknown step</p>
  );
}
