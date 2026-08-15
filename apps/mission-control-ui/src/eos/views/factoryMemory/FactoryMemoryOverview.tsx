import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { SchematicKpiStrip } from "@/components/schematic/SchematicKpiStrip";
import { SchematicSectionTitle } from "@/components/schematic/SchematicSectionTitle";
import { cn } from "@/lib/utils";

const PHASES = [
  {
    key: "factory-memory.hybrid",
    label: "Hybrid memory",
    detail: "lexical · semantic · code",
  },
  {
    key: "factory-memory.relationships",
    label: "Typed relations",
    detail: "authority · provenance",
  },
  {
    key: "factory-memory.agentic-retrieval",
    label: "Context planner",
    detail: "bounded retrieval",
  },
  {
    key: "factory-memory.knowledge-graph",
    label: "Knowledge graph",
    detail: "paths · neighborhoods",
  },
  {
    key: "factory-memory.context-engine",
    label: "Context engine",
    detail: "freeze · verify · learn",
  },
] as const;

interface FactoryMemoryOverviewData {
  phases: Record<string, boolean>;
  indexedDocuments: number;
  indexedChunks: number;
  entityCount: number;
  relationshipCount: number;
  contextPackageCount: number;
  sourceCoverage: Array<{ sourceType: string; count: number }>;
  latestIngestion: {
    status: "RUNNING" | "SUCCEEDED" | "DEGRADED" | "FAILED";
    indexedDocuments: number;
    indexedChunks: number;
    redactionCount: number;
    error?: string;
    startedAt: number;
    completedAt?: number;
  } | null;
  bounded: boolean;
}

function phaseTone(enabled: boolean) {
  return enabled
    ? "border-ok/40 bg-ok/5 text-ok"
    : "border-line bg-surface-2 text-ink-muted";
}

export function FactoryMemoryOverview({
  overview,
}: {
  overview: FactoryMemoryOverviewData | undefined;
}): JSX.Element {
  if (overview === undefined) {
    return (
      <div className="space-y-3 pt-4" aria-label="Loading Factory Memory">
        <div className="h-20 animate-pulse rounded-lg border border-line bg-surface-1" />
        <div className="h-48 animate-pulse rounded-lg border border-line bg-surface-1" />
      </div>
    );
  }

  const enabledCount = PHASES.filter(
    (phase) => overview.phases[phase.key],
  ).length;
  const latest = overview.latestIngestion;
  const hasException =
    latest?.status === "FAILED" || latest?.status === "DEGRADED";
  const maxCoverage = Math.max(
    1,
    ...overview.sourceCoverage.map((source) => source.count),
  );

  return (
    <div className="pt-4">
      <SchematicKpiStrip
        kpis={[
          { value: overview.indexedDocuments, label: "active documents" },
          { value: overview.indexedChunks, label: "retrieval chunks" },
          { value: overview.entityCount, label: "typed entities" },
          { value: overview.relationshipCount, label: "typed relations" },
          { value: overview.contextPackageCount, label: "frozen packages" },
          { value: `${enabledCount}/5`, label: "phases enabled" },
        ]}
      />

      <SchematicSectionTitle>Factory intelligence path</SchematicSectionTitle>
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
        {PHASES.map((phase, index) => {
          const enabled = overview.phases[phase.key] ?? false;
          return (
            <div key={phase.key} className="contents">
              <div
                className={cn(
                  "rounded-lg border px-3 py-3",
                  phaseTone(enabled),
                )}
              >
                <div className="flex items-center gap-2">
                  {enabled ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span className="text-[12px] font-semibold">
                    {phase.label}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[10.5px]">
                  {phase.detail}
                </div>
              </div>
              {index < PHASES.length - 1 ? (
                <ArrowRight className="mx-auto hidden h-4 w-4 self-center text-ink-muted lg:block" />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-line bg-surface-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">
                Index coverage
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-muted">
                Active, authorized source projections. Counts are capped at
                1,000 per collection in this overview.
              </p>
            </div>
            <Database className="h-4 w-4 text-schematic-accent" aria-hidden />
          </div>
          {overview.sourceCoverage.length ? (
            <div className="mt-4 space-y-2.5">
              {overview.sourceCoverage.map((source) => (
                <div key={source.sourceType}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[11.5px]">
                    <span className="font-mono text-ink-secondary">
                      {source.sourceType}
                    </span>
                    <span className="tabular-nums text-ink-muted">
                      {source.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-schematic-accent"
                      style={{
                        width: `${(source.count / maxCoverage) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-line px-3 py-5 text-center text-[12px] text-ink-muted">
              No Factory Memory sources have been indexed in this workspace.
            </p>
          )}
        </section>

        <div className="space-y-4">
          <section
            className={cn(
              "rounded-lg border p-4",
              hasException
                ? "border-warning/50 bg-warning/5"
                : "border-line bg-surface-1",
            )}
          >
            <div className="flex items-center gap-2">
              {hasException ? (
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              ) : (
                <ShieldCheck className="h-4 w-4 text-ok" aria-hidden />
              )}
              <h2 className="text-[13px] font-semibold text-ink">
                Ingestion health
              </h2>
            </div>
            {latest ? (
              <div className="mt-3 space-y-1.5 text-[12px] text-ink-secondary">
                <p>
                  <span className="font-medium text-ink">{latest.status}</span>
                  {" · "}
                  {latest.indexedDocuments} documents · {latest.indexedChunks}{" "}
                  chunks
                </p>
                <p>{latest.redactionCount} secret-shaped values redacted</p>
                {latest.error ? (
                  <p className="rounded-md bg-warning/10 px-2 py-1 text-warning">
                    {latest.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-ink-muted">
                No ingestion run has been recorded yet.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface-1 p-4">
            <h2 className="text-[13px] font-semibold text-ink">
              Governance invariants
            </h2>
            <ul className="mt-3 space-y-2 text-[11.5px] text-ink-secondary">
              <li>• Source systems remain authoritative.</li>
              <li>• Inferred edges always show confidence and provenance.</li>
              <li>
                • Context Packages freeze per Attempt and never accept work.
              </li>
              <li>• Learning creates reviewable proposals only.</li>
            </ul>
          </section>
        </div>
      </div>

      {overview.bounded ? (
        <p className="mt-3 text-[10.5px] text-ink-muted">
          Overview counts reached a bounded read cap. Search and filtered views
          remain scoped and paged independently.
        </p>
      ) : null}
    </div>
  );
}
