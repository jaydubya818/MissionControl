import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  CheckCircle2,
  GitCompareArrows,
  PackageCheck,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { SchematicSectionTitle } from "@/components/schematic/SchematicSectionTitle";
import { cn } from "@/lib/utils";

function priorityTone(priority: string) {
  if (priority === "required")
    return "border-danger/40 bg-danger/5 text-danger";
  if (priority === "high") return "border-warning/40 bg-warning/5 text-warning";
  return "border-line bg-surface-2 text-ink-secondary";
}

function PackageList({
  packages,
  selectedId,
  onSelect,
}: {
  packages: Array<{
    _id: Id<"factoryContextPackages">;
    workOrderId: Id<"workOrders">;
    workflowRunId?: Id<"workflowRuns">;
    purpose: string;
    generatedAt: number;
    items: unknown[];
    estimatedTokens: number;
    contentHash: string;
  }>;
  selectedId: Id<"factoryContextPackages"> | null;
  onSelect: (id: Id<"factoryContextPackages">) => void;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      {packages.map((contextPackage) => (
        <button
          key={contextPackage._id}
          type="button"
          onClick={() => onSelect(contextPackage._id)}
          className={cn(
            "w-full rounded-md border px-3 py-2.5 text-left",
            selectedId === contextPackage._id
              ? "border-schematic-accent bg-schematic-accent-soft"
              : "border-line bg-surface-1 hover:border-schematic-accent",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold capitalize text-ink">
              {contextPackage.purpose}
            </span>
            <span className="text-[10px] tabular-nums text-ink-muted">
              {new Date(contextPackage.generatedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-1 text-[10.5px] text-ink-muted">
            {contextPackage.items.length} items ·{" "}
            {contextPackage.estimatedTokens.toLocaleString()} tokens
          </div>
          <div className="mt-1 truncate font-mono text-[9.5px] text-ink-muted">
            {contextPackage.contentHash}
          </div>
        </button>
      ))}
    </div>
  );
}

export function FactoryMemoryContext({
  projectId,
  enabled,
}: {
  projectId: Id<"projects">;
  enabled: boolean;
}): JSX.Element {
  const packages = useQuery(
    api.factoryMemory.listContextPackages,
    enabled ? { projectId, limit: 30 } : "skip",
  );
  const [selectedId, setSelectedId] =
    useState<Id<"factoryContextPackages"> | null>(null);
  const [compareId, setCompareId] = useState("");
  useEffect(() => {
    if (!selectedId && packages?.[0]) setSelectedId(packages[0]._id);
  }, [packages, selectedId]);
  const detail = useQuery(
    api.factoryMemory.getContextPackage,
    enabled && selectedId
      ? { projectId, contextPackageId: selectedId }
      : "skip",
  );
  const diff = useQuery(
    api.factoryMemory.diffContextPackages,
    enabled && selectedId && compareId && compareId !== selectedId
      ? {
          projectId,
          beforeId: compareId as Id<"factoryContextPackages">,
          afterId: selectedId,
        }
      : "skip",
  );

  const itemSourceTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of detail?.contextPackage.items ?? [])
      counts.set(item.sourceType, (counts.get(item.sourceType) ?? 0) + 1);
    return [...counts.entries()];
  }, [detail?.contextPackage.items]);

  if (!enabled) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-surface-1 px-5 py-8 text-center">
        <PackageCheck className="mx-auto h-6 w-6 text-ink-muted" aria-hidden />
        <h2 className="mt-3 text-[14px] font-semibold text-ink">
          Autonomous Context Engineering is disabled
        </h2>
        <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-ink-muted">
          Enable <code>factory-memory.context-engine</code> only after
          retrieval, graph, budget, and isolation checks pass. Attempts continue
          without a Factory Memory snapshot while it is off.
        </p>
      </div>
    );
  }

  if (packages === undefined) {
    return (
      <div className="mt-4 h-72 animate-pulse rounded-lg border border-line bg-surface-1" />
    );
  }

  if (!packages.length) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-1 px-5 py-10 text-center">
        <PackageCheck className="mx-auto h-7 w-7 text-ink-muted" aria-hidden />
        <h2 className="mt-3 text-[14px] font-semibold text-ink">
          No frozen Context Packages yet
        </h2>
        <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-ink-muted">
          A governed retrieval plan freezes its selected source revisions before
          an Attempt starts. Empty or irrelevant context is not padded.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
            Frozen packages
          </span>
          <span className="text-[10.5px] tabular-nums text-ink-muted">
            {packages.length}
          </span>
        </div>
        <PackageList
          packages={packages}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setCompareId("");
          }}
        />
      </aside>

      <main className="min-w-0">
        {detail === undefined ? (
          <div className="h-72 animate-pulse rounded-lg border border-line bg-surface-1" />
        ) : detail === null ? (
          <div className="rounded-lg border border-line bg-surface-1 px-4 py-8 text-center text-[12px] text-ink-muted">
            This Context Package is no longer available in the workspace.
          </div>
        ) : (
          <>
            <section className="rounded-lg border border-schematic-accent/40 bg-schematic-accent-soft/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <PackageCheck
                      className="h-4 w-4 text-schematic-accent"
                      aria-hidden
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-schematic-accent">
                      Frozen Attempt context
                    </span>
                  </div>
                  <h2 className="mt-2 text-[16px] font-semibold text-ink">
                    {detail.contextPackage.objective}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {itemSourceTypes.map(([sourceType, count]) => (
                      <span
                        key={sourceType}
                        className="rounded border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary"
                      >
                        {sourceType} · {count}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right text-[11px] text-ink-muted">
                  <div>{detail.contextPackage.items.length} selected items</div>
                  <div>
                    {detail.contextPackage.estimatedTokens.toLocaleString()} /{" "}
                    {(
                      detail.contextPackage.budget.maxEstimatedTokens ?? 0
                    ).toLocaleString()}{" "}
                    tokens
                  </div>
                  <div className="mt-1 font-mono text-[9.5px]">
                    {detail.contextPackage.contentHash}
                  </div>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-schematic-accent"
                  style={{
                    width: `${Math.min(
                      100,
                      (detail.contextPackage.estimatedTokens /
                        Math.max(
                          1,
                          detail.contextPackage.budget.maxEstimatedTokens ?? 1,
                        )) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-ink-muted">
                <a
                  href={`/v2/control-work-orders?workspace=${encodeURIComponent(
                    String(projectId),
                  )}&workOrder=${encodeURIComponent(
                    String(detail.contextPackage.workOrderId),
                  )}`}
                  className="inline-flex items-center gap-1 text-schematic-accent hover:underline"
                >
                  Open WorkOrder
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </a>
                <span>
                  strategies:{" "}
                  {detail.contextPackage.retrievalStrategies.join(" · ")}
                </span>
              </div>
            </section>

            <section className="mt-3 rounded-lg border border-line bg-surface-1 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <GitCompareArrows
                  className="h-4 w-4 text-ink-muted"
                  aria-hidden
                />
                <label
                  htmlFor="context-package-compare"
                  className="text-[11.5px] font-medium text-ink-secondary"
                >
                  Compare this retry/version against
                </label>
                <select
                  id="context-package-compare"
                  value={compareId}
                  onChange={(event) => setCompareId(event.target.value)}
                  className="h-8 min-w-[220px] rounded-md border border-line bg-surface-2 px-2 text-[11.5px] text-ink"
                >
                  <option value="">Choose an earlier package</option>
                  {packages
                    .filter(
                      (contextPackage) => contextPackage._id !== selectedId,
                    )
                    .map((contextPackage) => (
                      <option
                        key={contextPackage._id}
                        value={contextPackage._id}
                      >
                        {contextPackage.purpose} ·{" "}
                        {new Date(contextPackage.generatedAt).toLocaleString()}
                      </option>
                    ))}
                </select>
              </div>
              {compareId && diff === undefined ? (
                <div className="mt-3 h-10 animate-pulse rounded bg-surface-2" />
              ) : diff ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {[
                    ["added", diff.added.length],
                    ["removed", diff.removed.length],
                    ["revisions", diff.changedRevisions.length],
                    ["graph paths", diff.changedRelationshipPaths.length],
                  ].map(([label, count]) => (
                    <div
                      key={label}
                      className="rounded-md border border-line bg-surface-2 px-3 py-2"
                    >
                      <b className="block text-[15px] tabular-nums text-ink">
                        {count}
                      </b>
                      <span className="text-[10.5px] text-ink-muted">
                        {label} changed
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <SchematicSectionTitle>
              Selected context and provenance
            </SchematicSectionTitle>
            <div className="space-y-2">
              {detail.contextPackage.items.map((item) => (
                <article
                  key={item.chunkId}
                  className="rounded-lg border border-line bg-surface-1 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px]",
                            priorityTone(item.priority),
                          )}
                        >
                          {item.priority}
                        </span>
                        <span className="font-mono text-[10px] text-schematic-accent">
                          {item.sourceType}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          {item.retrievalMethod}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-[12.5px] font-semibold text-ink">
                        {item.sourceId}
                      </h3>
                      <p className="mt-0.5 font-mono text-[9.5px] text-ink-muted">
                        {item.provenance.path ?? item.sourceId}
                        {item.provenance.revision
                          ? ` · ${item.provenance.revision}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-[10.5px] tabular-nums text-ink-muted">
                      {item.estimatedTokens} tokens
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-secondary">
                    {item.content}
                  </p>
                  <p className="mt-2 border-t border-line pt-2 text-[10.5px] text-ink-muted">
                    Why selected: {item.reason}
                  </p>
                  {item.relationshipPath?.length ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-ink-muted">
                      {item.relationshipPath.map((step, index) => (
                        <span key={`${step.source}-${step.relation}-${index}`}>
                          {index ? " → " : ""}
                          {step.source} <b>{step.relation}</b> {step.target}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <section className="rounded-lg border border-line bg-surface-1 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-ok" aria-hidden />
                  <h2 className="text-[13px] font-semibold text-ink">
                    Advisory verification context
                  </h2>
                </div>
                <p className="mt-1 text-[10.5px] text-ink-muted">
                  These checks require objective evidence. They cannot satisfy
                  WorkOrder acceptance.
                </p>
                {detail.verificationPlan?.checks.length ? (
                  <div className="mt-3 space-y-2">
                    {detail.verificationPlan.checks.map((check) => (
                      <div
                        key={check.id}
                        className="rounded-md border border-line bg-surface-2 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-medium text-ink">
                            {check.name}
                          </span>
                          <span className="text-[9.5px] text-ok">
                            evidence required
                          </span>
                        </div>
                        <p className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">
                          {check.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11.5px] text-ink-muted">
                    No advisory verification plan was recorded for this package.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-line bg-surface-1 p-4">
                <h2 className="text-[13px] font-semibold text-ink">
                  Context effectiveness
                </h2>
                {detail.evaluations.length ? (
                  <div className="mt-3 space-y-2">
                    {detail.evaluations.map((evaluation) => (
                      <div
                        key={evaluation._id}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px]"
                      >
                        {evaluation.passed ? (
                          <CheckCircle2
                            className="h-3.5 w-3.5 text-ok"
                            aria-hidden
                          />
                        ) : (
                          <XCircle
                            className="h-3.5 w-3.5 text-danger"
                            aria-hidden
                          />
                        )}
                        <span className="truncate font-mono text-ink-secondary">
                          {evaluation.key}
                        </span>
                        <span className="tabular-nums text-ink-muted">
                          {Math.round(evaluation.score * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11.5px] text-ink-muted">
                    No effectiveness evals have been recorded yet.
                  </p>
                )}
                <div className="mt-4 border-t border-line pt-3 text-[10.5px] text-ink-muted">
                  {detail.observations.length} retrieval observations linked to
                  this frozen package.
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
