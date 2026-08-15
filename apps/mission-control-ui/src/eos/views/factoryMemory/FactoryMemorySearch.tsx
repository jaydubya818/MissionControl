import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  FileSearch,
  Filter,
  Search,
  ShieldCheck,
} from "lucide-react";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { SchematicSectionTitle } from "@/components/schematic/SchematicSectionTitle";

const SOURCE_TYPES = [
  "source-code",
  "repository-document",
  "adr",
  "work-order",
  "attempt",
  "factory-version",
  "verification-plan",
  "verification-evidence",
  "trace",
  "eval",
  "incident",
  "test",
  "pull-request",
  "git-history",
  "artifact",
  "regression-case",
] as const;

function dateBoundary(value: string, endOfDay = false): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
  );
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sourceHref(
  result: { workOrderId?: Id<"workOrders">; metadata?: unknown },
  projectId: Id<"projects">,
): string | null {
  if (result.metadata && typeof result.metadata === "object") {
    const href = (result.metadata as Record<string, unknown>).href;
    if (typeof href === "string" && href.startsWith("/")) return href;
  }
  if (result.workOrderId)
    return `/v2/control-work-orders?workspace=${encodeURIComponent(
      String(projectId),
    )}&workOrder=${encodeURIComponent(String(result.workOrderId))}`;
  return null;
}

function DisabledState(): JSX.Element {
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-1 px-5 py-8 text-center">
      <ShieldCheck className="mx-auto h-6 w-6 text-ink-muted" aria-hidden />
      <h2 className="mt-3 text-[14px] font-semibold text-ink">
        Hybrid Factory Memory is disabled
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-ink-muted">
        Enable <code>factory-memory.hybrid</code> for this workspace after the
        ingestion and isolation checks are approved. Existing execution flows
        continue unchanged while it is off.
      </p>
    </div>
  );
}

export function FactoryMemorySearch({
  projectId,
  enabled,
}: {
  projectId: Id<"projects">;
  enabled: boolean;
}): JSX.Element {
  const repositories = useQuery(api.projects.listRepositories, { projectId });
  const workOrders = useQuery(api.workOrders.list, { projectId });
  const workflowRuns = useQuery(api.workflowRuns.list, { projectId });
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [repositoryId, setRepositoryId] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [workflowRunId, setWorkflowRunId] = useState("");
  const [factoryVersionId, setFactoryVersionId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const selectedRepository = repositoryId
    ? (repositoryId as Id<"workspaceRepositories">)
    : undefined;
  const versionOptions = useQuery(
    api["factory/configuration"].getVersionOptions,
    selectedRepository
      ? { projectId, repositoryId: selectedRepository }
      : "skip",
  );
  const searchArgs = useMemo(
    () =>
      submittedQuery === null || !enabled
        ? null
        : {
            projectId,
            repositoryId: selectedRepository,
            query: submittedQuery,
            sourceTypes: sourceType
              ? [sourceType as (typeof SOURCE_TYPES)[number]]
              : undefined,
            workOrderId: workOrderId
              ? (workOrderId as Id<"workOrders">)
              : undefined,
            workflowRunId: workflowRunId
              ? (workflowRunId as Id<"workflowRuns">)
              : undefined,
            factoryDefinitionVersionId: factoryVersionId
              ? (factoryVersionId as Id<"factoryDefinitionVersions">)
              : undefined,
            fromTimestamp: dateBoundary(fromDate),
            toTimestamp: dateBoundary(toDate, true),
            limit: 24,
            budget: { maxItems: 24, maxEstimatedTokens: 24_000 },
          },
    [
      enabled,
      factoryVersionId,
      fromDate,
      projectId,
      selectedRepository,
      sourceType,
      submittedQuery,
      toDate,
      workOrderId,
      workflowRunId,
    ],
  );
  const searchResult = useQuery(api.factoryMemory.search, searchArgs ?? "skip");

  if (!enabled) return <DisabledState />;

  const runSearch = () => setSubmittedQuery(query.trim());

  return (
    <div className="pt-4">
      <form
        className="rounded-lg border border-line bg-surface-1 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        <label
          htmlFor="factory-memory-query"
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary"
        >
          Search engineering memory
        </label>
        <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              id="factory-memory-query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What changed auth middleware before, and what broke?"
              className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted focus:border-schematic-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-act px-4 text-[12.5px] font-medium text-act-ink hover:opacity-90"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            Retrieve
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Scope before ranking
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select
            aria-label="Repository filter"
            value={repositoryId}
            onChange={(event) => {
              setRepositoryId(event.target.value);
              setFactoryVersionId("");
            }}
            className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[12px] text-ink"
          >
            <option value="">All authorized repositories</option>
            {(repositories ?? []).map((repository) => (
              <option
                key={
                  repository.repositoryId ?? `legacy:${repository.repository}`
                }
                value={repository.repositoryId ?? ""}
                disabled={!repository.repositoryId}
              >
                {repository.displayName ?? repository.repository}
              </option>
            ))}
          </select>
          <select
            aria-label="Source type filter"
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value)}
            className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[12px] text-ink"
          >
            <option value="">All source types</option>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            aria-label="WorkOrder filter"
            value={workOrderId}
            onChange={(event) => setWorkOrderId(event.target.value)}
            className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[12px] text-ink"
          >
            <option value="">All WorkOrders</option>
            {(workOrders ?? []).slice(0, 100).map((workOrder) => (
              <option key={workOrder._id} value={workOrder._id}>
                {workOrder.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Attempt filter"
            value={workflowRunId}
            onChange={(event) => setWorkflowRunId(event.target.value)}
            className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[12px] text-ink"
          >
            <option value="">All Attempts</option>
            {(workflowRuns ?? []).slice(0, 100).map((run) => (
              <option key={run._id} value={run._id}>
                {run.runId} · {run.status}
              </option>
            ))}
          </select>
          <select
            aria-label="FactoryVersion filter"
            value={factoryVersionId}
            disabled={!selectedRepository}
            onChange={(event) => setFactoryVersionId(event.target.value)}
            className="h-9 rounded-md border border-line bg-surface-2 px-2.5 text-[12px] text-ink disabled:opacity-50"
          >
            <option value="">All FactoryVersions</option>
            {(versionOptions?.factoryVersions ?? []).map((version) => (
              <option key={version._id} value={version._id}>
                v{version.version} · {version.status}
              </option>
            ))}
          </select>
          <label className="grid grid-cols-[52px_1fr] items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5">
            <span className="text-[11px] text-ink-muted">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-8 min-w-0 bg-transparent text-[12px] text-ink outline-none"
            />
          </label>
          <label className="grid grid-cols-[52px_1fr] items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5">
            <span className="text-[11px] text-ink-muted">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-8 min-w-0 bg-transparent text-[12px] text-ink outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setRepositoryId("");
              setSourceType("");
              setWorkOrderId("");
              setWorkflowRunId("");
              setFactoryVersionId("");
              setFromDate("");
              setToDate("");
            }}
            className="h-9 rounded-md border border-line bg-surface-2 px-3 text-[12px] text-ink-secondary hover:text-ink"
          >
            Clear filters
          </button>
        </div>
      </form>

      {submittedQuery === null ? (
        <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-1 px-5 py-10 text-center">
          <FileSearch className="mx-auto h-7 w-7 text-ink-muted" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-ink">
            Ask a bounded engineering question
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-ink-muted">
            Results combine lexical, deterministic semantic, and code-aware
            signals. Workspace and repository authorization is applied before
            ranking.
          </p>
        </div>
      ) : searchResult === undefined ? (
        <div className="mt-4 space-y-2" aria-label="Retrieving Factory Memory">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-lg border border-line bg-surface-1"
            />
          ))}
        </div>
      ) : (
        <>
          <SchematicSectionTitle>
            {searchResult.selectedCount} selected · {searchResult.rejectedCount}{" "}
            rejected · {searchResult.estimatedTokens.toLocaleString()} estimated
            tokens
          </SchematicSectionTitle>
          {searchResult.results.length ? (
            <div className="space-y-2.5">
              {searchResult.results.map((result) => {
                const href = sourceHref(result, projectId);
                return (
                  <article
                    key={result._id}
                    className="rounded-lg border border-line bg-surface-1 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-schematic-accent">
                            {result.sourceType}
                          </span>
                          <span className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-ink-secondary">
                            {result.retrievalMethod}
                          </span>
                          <span className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-ink-secondary">
                            {result.provenance.derivation ?? "authoritative"}
                          </span>
                        </div>
                        <h2 className="mt-2 truncate text-[13.5px] font-semibold text-ink">
                          {result.title ?? result.sourceId}
                        </h2>
                        <p className="mt-0.5 font-mono text-[10.5px] text-ink-muted">
                          {result.provenance.path ?? result.sourceId}
                          {result.provenance.lineStart
                            ? `:${result.provenance.lineStart}-${
                                result.provenance.lineEnd ??
                                result.provenance.lineStart
                              }`
                            : ""}
                          {result.provenance.revision
                            ? ` · ${result.provenance.revision}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                          {Math.round(result.score * 100)}% ·{" "}
                          {result.estimatedTokens} tokens
                        </span>
                        {href ? (
                          <a
                            href={href}
                            className="inline-flex items-center gap-1 text-[11.5px] text-schematic-accent hover:underline"
                          >
                            Open source
                            <ArrowUpRight className="h-3 w-3" aria-hidden />
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-secondary">
                      {result.content}
                    </p>
                    <p className="mt-3 border-t border-line pt-2 text-[11px] text-ink-muted">
                      Why selected: {result.reason}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-surface-1 px-5 py-10 text-center">
              <h2 className="text-[14px] font-semibold text-ink">
                No authorized context matched
              </h2>
              <p className="mt-1 text-[12px] text-ink-muted">
                Broaden the filters or index an authoritative source. The
                retriever will not pad results with unrelated memory.
              </p>
            </div>
          )}
          {searchResult.bounded ? (
            <p className="mt-3 text-[10.5px] text-ink-muted">
              Candidate generation reached its safety cap. Narrow the source,
              repository, or time range for a more complete result set.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
