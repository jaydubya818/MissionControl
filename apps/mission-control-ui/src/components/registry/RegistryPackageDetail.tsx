import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  FileText,
  FlaskConical,
  FolderOpen,
  Shield,
  Sparkles,
  Layers,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { RegistryEntry } from "../../RegistryView";
import { RegistryScoreHex } from "./RegistryScoreHex";
import { RegistryMetricBar } from "./RegistryMetricBar";
import { RegistryInstallCli } from "./RegistryInstallCli";
import { RegistryEvalComparison } from "./RegistryEvalComparison";
import { RegistryQualityReview } from "./RegistryQualityReview";
import { RegistryDescriptionExamples, RegistryPitfallAlerts } from "./RegistrySkillPitfalls";
import { RegistryModelBenchmark } from "./RegistryModelBenchmark";
import { detectSkillPitfalls } from "@/lib/skillPitfalls";
import { RegistrySkillMarkdown } from "./RegistrySkillMarkdown";
import { RegistryFixBanner } from "./RegistryFixBanner";
import { RegistryFileBrowser, type FileTreeNode } from "./RegistryFileBrowser";
import { RegistryRelatedSkills } from "./RegistryRelatedSkills";
import {
  buildEvalScenarioBlocks,
  evalImprovementPct,
  overallEvalPct,
} from "@/lib/registryEvalComparison";
import { impactMultiplier } from "@/lib/registryCategories";
import { cn } from "@/lib/utils";
import { MutationTestingPanel } from "@/harness/components/MutationTestingPanel";
import { Button } from "@/components/ui/button";

const DETAIL_TABS = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "quality", label: "Quality", icon: Sparkles },
  { id: "evals", label: "Evals", icon: FlaskConical },
  { id: "outer-loop", label: "Outer loop", icon: Layers },
  { id: "security", label: "Security", icon: Shield },
  { id: "files", label: "Files", icon: FolderOpen },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]["id"];

export interface RegistryPackageDetailProps {
  entry: RegistryEntry;
  allEntries?: RegistryEntry[];
  onBack: () => void;
  onSelectEntry?: (entry: RegistryEntry) => void;
}

/** Tessl-style package detail (themis layout). */
export function RegistryPackageDetail({
  entry,
  allEntries = [],
  onBack,
  onSelectEntry,
}: RegistryPackageDetailProps): JSX.Element {
  const [tab, setTab] = useState<DetailTab>("files");
  const [fileView, setFileView] = useState<"preview" | "code">("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const detail = useQuery(api.context.packages.getDetail, {
    packageId: entry._id as Id<"contextPackages">,
  });
  const evalProfile = useQuery(api.context.evals.getEvalProfile, {
    packageId: entry._id as Id<"contextPackages">,
  });
  const ensurePackageEval = useMutation(api.context.evals.ensurePackageEval);
  const generateVerifier = useMutation(api.context.verifiers.generateFromSkill);
  const packageVerifiers = useQuery(api.context.verifiers.list, {
    packageId: entry._id as Id<"contextPackages">,
    activeOnly: true,
  });
  const ensuredEvalRef = useRef(false);
  const versions = useQuery(api.context.packages.listVersions, {
    packageId: entry._id as Id<"contextPackages">,
  });

  useEffect(() => {
    if (evalProfile === undefined || ensuredEvalRef.current) return;
    if (evalProfile?.latestRun?.status === "COMPLETED") return;
    ensuredEvalRef.current = true;
    void ensurePackageEval({
      packageId: entry._id as Id<"contextPackages">,
      actorId: "registry-detail",
    }).catch(() => {
      ensuredEvalRef.current = false;
    });
  }, [entry._id, evalProfile, ensurePackageEval]);

  const displayName = `${entry.owner}/${entry.displayName ?? entry.name}`;
  const score = entry.qualityScore ?? 0;
  const axes = entry.reviewAxes ?? {
    validation: score,
    implementation: score,
    activation: score,
  };
  const quality = axes.validation;
  const evalSummary = evalProfile?.summary ?? null;
  const impact =
    evalSummary?.candidateScore ??
    entry.candidateScore ??
    entry.impactScore ??
    detail?.latestRun?.candidateScore ??
    Math.round((quality + axes.activation) / 2);
  const impactDeltaMultiplier = impactMultiplier(
    entry.qualityScore,
    evalSummary?.impactScore ?? entry.impactScore,
    evalSummary?.baselineScore ?? entry.baselineScore,
    evalSummary?.candidateScore ?? entry.candidateScore
  );
  const securityPassed = entry.securityStatus === "PASSED";

  const evalBlocks = useMemo(() => {
    const activeScenarios = evalProfile?.scenarios ?? [];
    const rawResults = evalProfile?.latestRun?.results ?? detail?.latestRun?.results ?? [];
    const results = rawResults.map((r) => ({
      ...r,
      criterionResults: r.criterionResults ? [...r.criterionResults] : undefined,
    }));
    return buildEvalScenarioBlocks(activeScenarios, results, impact);
  }, [evalProfile, detail?.latestRun?.results, impact]);

  const evalOverall =
    (evalSummary?.candidateScore ?? overallEvalPct(evalBlocks)) || impact;
  const improvementPct = evalImprovementPct(
    evalSummary?.baselineScore ?? entry.baselineScore,
    evalSummary?.candidateScore ?? entry.candidateScore
  );

  const [fileTree, setFileTree] = useState<FileTreeNode[] | undefined>(undefined);
  const listSourceTree = useAction(api.context.packageFiles.listSourceTree);

  useEffect(() => {
    if (!entry.sourceRepo) {
      setFileTree(undefined);
      return;
    }
    let cancelled = false;
    void listSourceTree({
      sourceRepo: entry.sourceRepo,
      sourcePath: detail?.version?.sourcePath,
    }).then((result) => {
      if (!cancelled) setFileTree(result.tree as FileTreeNode[]);
    }).catch(() => {
      if (!cancelled) setFileTree(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.sourceRepo, detail?.version?.sourcePath, listSourceTree]);

  const skillPath =
    detail?.version?.sourcePath ?? `skills/${entry.name}/SKILL.md`;
  const activeFile = selectedFile ?? skillPath;

  const skillContent =
    detail?.version?.inlineContent ??
    `# ${entry.displayName ?? entry.name}\n\n${entry.description}\n\n## When to use\n\nLoad this ${entry.type.toLowerCase()} when the task matches its description.\n\n## Source\n\n${entry.sourceRepo ?? entry.owner}`;

  const latestVersion = entry.version ?? versions?.[0]?.version ?? null;

  const detectedPitfalls = useMemo(
    () =>
      detectSkillPitfalls({
        description: entry.description,
        name: entry.name,
        tags: entry.tags,
        reviewAxes: entry.reviewAxes,
      }),
    [entry.description, entry.name, entry.tags, entry.reviewAxes]
  );

  return (
    <div className="registry-detail pb-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to discover
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <nav className="font-mono text-[12px] text-ink-muted">
          Registry / {entry.owner} / {entry.name}
          {latestVersion ? ` / ${latestVersion}` : ""}
        </nav>
        {versions && versions.length > 0 ? (
          <div className="registry-version-select">
            <span>
              {latestVersion} {versions[0]?.version === latestVersion ? "(Latest)" : ""}
            </span>
            <ChevronDown size={14} aria-hidden />
          </div>
        ) : null}
      </div>

      <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-ink">{displayName}</h1>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-secondary">
        {entry.description}
      </p>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <RegistryScoreHex score={score} size="lg" delta={impactDeltaMultiplier} />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <RegistryMetricBar
            label="Quality"
            value={quality}
            hint="Does it follow best practices?"
            onClick={() => setTab("quality")}
          />
          <RegistryMetricBar
            label="Impact"
            value={evalSummary?.impactScore ?? impact}
            hint={`Average score across ${evalProfile?.scenarioCount ?? entry.scenarioCount ?? 0} eval scenarios`}
            delta={impactDeltaMultiplier}
            tone="impact"
            onClick={() => setTab("evals")}
          />
          <RegistryMetricBar
            label="Security"
            value={securityPassed ? 100 : entry.securityStatus === "FAILED" ? 0 : 50}
            hint={securityPassed ? "No known issues" : "Review before production rollout"}
            tone="security"
            sublabel="by Mission Control"
            passedLabel={securityPassed ? "Passed" : undefined}
            onClick={() => setTab("security")}
          />
        </div>
      </div>

      <RegistryFixBanner skillPath={skillPath} />

      <div className="registry-detail-tabs mt-8" role="tablist">
        {DETAIL_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "registry-detail-tab",
                tab === t.id && "registry-detail-tab-active"
              )}
            >
              <Icon size={14} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-surface-1 p-5">
                <h2 className="text-[17px] font-semibold text-ink">Package overview</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">{entry.description}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <AxisTile label="Validation" value={axes.validation} />
                  <AxisTile label="Implementation" value={axes.implementation} />
                  <AxisTile label="Activation" value={axes.activation} />
                </div>
              </div>
              {evalBlocks.length > 0 ? (
                <RegistryEvalComparison
                  overallPct={evalOverall}
                  overallDelta={evalSummary?.impactDelta ?? entry.impactDelta}
                  improvementPct={improvementPct}
                  summary={{
                    baselineScore: evalSummary?.baselineScore ?? entry.baselineScore,
                    candidateScore: evalSummary?.candidateScore ?? entry.candidateScore,
                    impactScore: evalSummary?.impactScore ?? entry.impactScore,
                    impactDelta: evalSummary?.impactDelta ?? entry.impactDelta,
                    scenarioCount: evalProfile?.scenarioCount ?? entry.scenarioCount,
                    completedAt: evalSummary?.completedAt ?? entry.evalCompletedAt,
                  }}
                  scenarios={evalBlocks.slice(0, 1)}
                />
              ) : null}
            </div>
          )}

          {tab === "quality" && (
            <div className="space-y-6">
              <RegistryPitfallAlerts pitfalls={detectedPitfalls} />
              <RegistryQualityReview
                axes={axes}
                qualityScore={quality}
                description={entry.description}
              />
            </div>
          )}

          {tab === "evals" && (
            <div className="space-y-6">
              <RegistryModelBenchmark
                baselineScore={evalSummary?.baselineScore ?? entry.baselineScore}
                candidateScore={evalSummary?.candidateScore ?? entry.candidateScore}
              />
              <RegistryEvalComparison
              overallPct={evalOverall}
              overallDelta={evalSummary?.impactDelta ?? entry.impactDelta}
              improvementPct={improvementPct}
              summary={{
                baselineScore: evalSummary?.baselineScore ?? entry.baselineScore,
                candidateScore: evalSummary?.candidateScore ?? entry.candidateScore,
                impactScore: evalSummary?.impactScore ?? entry.impactScore,
                impactDelta: evalSummary?.impactDelta ?? entry.impactDelta,
                scenarioCount: evalProfile?.scenarioCount ?? entry.scenarioCount,
                completedAt: evalSummary?.completedAt ?? entry.evalCompletedAt,
              }}
              scenarios={evalBlocks}
            />
            </div>
          )}

          {tab === "outer-loop" && (
            <div className="space-y-4">
              <div className="registry-top-card grid gap-3 p-4 sm:grid-cols-3">
                <div>
                  <div className="text-[11px] uppercase text-ink-muted">Evals</div>
                  <div className="text-lg font-semibold text-registry-accent">{evalOverall}%</div>
                  <div className="text-xs text-ink-secondary">{evalProfile?.scenarioCount ?? 0} scenarios</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-ink-muted">Verifiers</div>
                  <div className="text-lg font-semibold text-ink">{packageVerifiers?.length ?? 0}</div>
                  <div className="text-xs text-ink-secondary">active invariants</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-ink-muted">Security</div>
                  <div className="text-lg font-semibold text-ink">{securityPassed ? "Passed" : entry.securityStatus ?? "Unscanned"}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">Outer loop evidence</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void generateVerifier({
                      packageId: entry._id as Id<"contextPackages">,
                      actorId: "registry-detail",
                    })
                  }
                >
                  Create verifier from skill
                </Button>
              </div>
              <MutationTestingPanel projectId={detail?.package?.projectId} />
              {packageVerifiers && packageVerifiers.length > 0 ? (
                <ul className="space-y-2 rounded-xl border border-line bg-surface-1 p-4">
                  {packageVerifiers.map((vr) => (
                    <li key={vr._id} className="text-sm text-ink-secondary">
                      <span className="font-medium text-ink">{vr.label}</span> — {vr.invariant}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">No verifiers linked yet.</p>
              )}
            </div>
          )}

          {tab === "security" && (
            <div className="rounded-xl border border-line bg-surface-1 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-registry-accent" />
                  <h2 className="text-[15px] font-semibold text-ink">Security</h2>
                  <span className="text-[12px] text-ink-muted">by Mission Control</span>
                </div>
                {securityPassed ? (
                  <span className="rounded-full bg-registry-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-registry-accent">
                    Passed
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-[13.5px] text-ink-secondary">
                Status:{" "}
                <strong className="text-ink">{entry.securityStatus ?? "UNSCANNED"}</strong>
              </p>
              <RegistryMetricBar
                className="mt-4"
                label="Security posture"
                value={securityPassed ? 100 : 0}
                hint={securityPassed ? "No known issues detected" : "Run security scan before rollout"}
                tone="security"
              />
            </div>
          )}

          {tab === "files" && (
            <div className="rounded-xl border border-line bg-surface-1">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-2 font-mono text-[13px] text-ink-secondary">
                  <FileText size={14} aria-hidden />
                  <span className="truncate">{activeFile}</span>
                </div>
                <div className="registry-preview-toggle" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fileView === "preview"}
                    onClick={() => setFileView("preview")}
                    className={cn(fileView === "preview" && "registry-preview-toggle-active")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fileView === "code"}
                    onClick={() => setFileView("code")}
                    className={cn(fileView === "code" && "registry-preview-toggle-active")}
                  >
                    Code
                  </button>
                </div>
              </div>
              <div className="p-5">
                {fileView === "preview" ? (
                  <RegistrySkillMarkdown content={skillContent} />
                ) : (
                  <pre className="registry-scrolly whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink-secondary">
                    {skillContent}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <RegistryInstallCli
            slug={entry.slug}
            version={entry.version}
            sourceRepo={entry.sourceRepo}
            commitSha={detail?.version?.sourceCommitSha}
            skillName={entry.name}
          />
          <RegistryFileBrowser
            skillPath={skillPath}
            selectedPath={activeFile}
            onSelect={setSelectedFile}
            tree={fileTree}
          />
          {onSelectEntry ? (
            <RegistryRelatedSkills
              entries={allEntries}
              currentId={entry._id}
              onSelect={onSelectEntry}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function AxisTile({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-center">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-[20px] font-semibold text-registry-accent">{value}</div>
    </div>
  );
}
