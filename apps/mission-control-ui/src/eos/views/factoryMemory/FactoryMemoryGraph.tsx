import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  GitBranch,
  Network,
  Search,
  ShieldAlert,
} from "lucide-react";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { SchematicSectionTitle } from "@/components/schematic/SchematicSectionTitle";
import { cn } from "@/lib/utils";

const RELATIONS = [
  "depends_on",
  "used_by",
  "governed_by",
  "tests",
  "covered_by",
  "changes",
  "affected",
  "failed_because",
  "similar_to",
] as const;

function derivationTone(derivation: string) {
  if (derivation === "authoritative") return "border-ok/40 bg-ok/5 text-ok";
  if (derivation === "deterministic")
    return "border-schematic-accent/40 bg-schematic-accent-soft text-schematic-accent";
  return "border-warning/40 bg-warning/5 text-warning";
}

export function FactoryMemoryGraph({
  projectId,
  enabled,
}: {
  projectId: Id<"projects">;
  enabled: boolean;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"factoryEntities"> | null>(
    null,
  );
  const [targetId, setTargetId] = useState<Id<"factoryEntities"> | null>(null);
  const [relation, setRelation] = useState("");
  const [derivation, setDerivation] = useState("");
  const entities = useQuery(
    api.factoryMemory.searchEntities,
    enabled ? { projectId, query: submittedQuery, limit: 30 } : "skip",
  );
  useEffect(() => {
    if (!selectedId && entities?.[0]) setSelectedId(entities[0]._id);
  }, [entities, selectedId]);
  const graph = useQuery(
    api.factoryMemory.graphNeighborhood,
    enabled && selectedId
      ? {
          projectId,
          entityId: selectedId,
          relations: relation
            ? [relation as (typeof RELATIONS)[number]]
            : undefined,
          derivations: derivation
            ? [derivation as "authoritative" | "deterministic" | "inferred"]
            : undefined,
          maxDepth: 2,
          maxNodes: 50,
          fanOut: 15,
        }
      : "skip",
  );
  const path = useQuery(
    api.factoryMemory.findPath,
    enabled && selectedId && targetId && selectedId !== targetId
      ? {
          projectId,
          sourceId: selectedId,
          targetId,
          relations: relation
            ? [relation as (typeof RELATIONS)[number]]
            : undefined,
          derivations: derivation
            ? [derivation as "authoritative" | "deterministic" | "inferred"]
            : undefined,
          maxDepth: 3,
        }
      : "skip",
  );

  const selected = graph?.entities.find((entity) => entity._id === selectedId);
  const entityById = useMemo(
    () =>
      new Map((graph?.entities ?? []).map((entity) => [entity._id, entity])),
    [graph?.entities],
  );
  const depthById = useMemo(
    () =>
      new Map(
        (graph?.depths ?? []).map((entry) => [entry.entityId, entry.depth]),
      ),
    [graph?.depths],
  );

  if (!enabled) {
    return (
      <div className="mt-4 rounded-lg border border-line bg-surface-1 px-5 py-8 text-center">
        <Network className="mx-auto h-6 w-6 text-ink-muted" aria-hidden />
        <h2 className="mt-3 text-[14px] font-semibold text-ink">
          Factory Knowledge Graph is disabled
        </h2>
        <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-ink-muted">
          Enable <code>factory-memory.relationships</code> and{" "}
          <code>factory-memory.knowledge-graph</code> after typed-edge
          validation passes for this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-line bg-surface-1 p-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedQuery(query.trim());
              setSelectedId(null);
              setTargetId(null);
            }}
          >
            <label
              htmlFor="factory-entity-search"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary"
            >
              Resolve entity
            </label>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <input
                id="factory-entity-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="auth-middleware"
                className="h-9 w-full rounded-md border border-line bg-surface-2 pl-8 pr-2 text-[12px] text-ink outline-none focus:border-schematic-accent"
              />
            </div>
          </form>
          <div className="mt-3 max-h-[560px] space-y-1 overflow-y-auto pr-1">
            {entities === undefined ? (
              <div className="h-20 animate-pulse rounded-md bg-surface-2" />
            ) : entities.length ? (
              entities.map((entity) => (
                <button
                  key={entity._id}
                  type="button"
                  onClick={() => {
                    setSelectedId(entity._id);
                    setTargetId(null);
                  }}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-2 text-left",
                    selectedId === entity._id
                      ? "border-schematic-accent bg-schematic-accent-soft"
                      : "border-transparent hover:border-line hover:bg-surface-2",
                  )}
                >
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {entity.label}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-muted">
                    {entity.entityType} · {entity.key}
                  </span>
                </button>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-line px-3 py-5 text-center text-[11.5px] text-ink-muted">
                No typed entities matched.
              </p>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-1 p-3">
            <GitBranch className="h-4 w-4 text-schematic-accent" aria-hidden />
            <select
              aria-label="Relationship filter"
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
              className="h-8 rounded-md border border-line bg-surface-2 px-2 text-[11.5px] text-ink"
            >
              <option value="">All relationships</option>
              {RELATIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              aria-label="Derivation filter"
              value={derivation}
              onChange={(event) => setDerivation(event.target.value)}
              className="h-8 rounded-md border border-line bg-surface-2 px-2 text-[11.5px] text-ink"
            >
              <option value="">All derivations</option>
              <option value="authoritative">Authoritative</option>
              <option value="deterministic">Deterministic</option>
              <option value="inferred">Inferred</option>
            </select>
            <span className="ml-auto text-[10.5px] text-ink-muted">
              depth ≤ 3 · nodes ≤ 100 · fan-out ≤ 25
            </span>
          </div>

          {!selectedId ? (
            <div className="mt-3 rounded-lg border border-dashed border-line bg-surface-1 px-5 py-12 text-center">
              <Network className="mx-auto h-7 w-7 text-ink-muted" aria-hidden />
              <p className="mt-2 text-[12px] text-ink-muted">
                Select a typed entity to inspect its engineering neighborhood.
              </p>
            </div>
          ) : graph === undefined ? (
            <div className="mt-3 h-72 animate-pulse rounded-lg border border-line bg-surface-1" />
          ) : selected ? (
            <>
              <section className="mt-3 rounded-lg border border-schematic-accent/40 bg-schematic-accent-soft/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-[10.5px] text-schematic-accent">
                      {selected.entityType}
                    </span>
                    <h2 className="mt-1 text-[16px] font-semibold text-ink">
                      {selected.label}
                    </h2>
                    <p className="mt-1 font-mono text-[10.5px] text-ink-muted">
                      {selected.key}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-ink-muted">
                    <div>{graph.entities.length} entities</div>
                    <div>{graph.relationships.length} relationships</div>
                  </div>
                </div>
              </section>

              <SchematicSectionTitle>
                Inspect relationships
              </SchematicSectionTitle>
              {graph.relationships.length ? (
                <div className="space-y-2">
                  {graph.relationships.map((edge) => {
                    const source = entityById.get(edge.sourceId);
                    const target = entityById.get(edge.targetId);
                    const sourceDepth = depthById.get(edge.sourceId) ?? 0;
                    const targetDepth = depthById.get(edge.targetId) ?? 0;
                    const other = sourceDepth >= targetDepth ? source : target;
                    return (
                      <button
                        key={edge._id}
                        type="button"
                        onClick={() => {
                          if (other) setTargetId(other._id);
                        }}
                        className="grid w-full gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-left hover:border-schematic-accent sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span className="truncate text-[12px] font-medium text-ink">
                          {source?.label ?? String(edge.sourceId)}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-schematic-accent">
                          {edge.relation}
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </span>
                        <span className="truncate text-[12px] font-medium text-ink">
                          {target?.label ?? String(edge.targetId)}
                        </span>
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px]",
                            derivationTone(edge.derivation),
                          )}
                        >
                          {edge.derivation}
                          {edge.confidence !== undefined
                            ? ` · ${Math.round(edge.confidence * 100)}%`
                            : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-surface-1 px-4 py-8 text-center text-[12px] text-ink-muted">
                  No relationships match the current filters.
                </div>
              )}

              {targetId ? (
                <section className="mt-4 rounded-lg border border-line bg-surface-1 p-4">
                  <div className="flex items-center gap-2">
                    <GitBranch
                      className="h-4 w-4 text-schematic-accent"
                      aria-hidden
                    />
                    <h2 className="text-[13px] font-semibold text-ink">
                      Explainable path
                    </h2>
                  </div>
                  {path === undefined ? (
                    <div className="mt-3 h-12 animate-pulse rounded bg-surface-2" />
                  ) : path ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {path.steps.map((step, index) => (
                        <div
                          key={`${step.source}-${step.relation}-${index}`}
                          className="contents"
                        >
                          <span className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-ink">
                            {step.source}
                          </span>
                          <span className="font-mono text-[10px] text-schematic-accent">
                            {step.direction === "incoming" ? "← " : ""}
                            {step.relation}
                            {step.direction === "outgoing" ? " →" : ""}
                          </span>
                          {index === path.steps.length - 1 ? (
                            <span className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-ink">
                              {step.target}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-warning/5 px-3 py-2 text-[11.5px] text-warning">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                      No authorized path exists within the three-hop bound.
                    </div>
                  )}
                </section>
              ) : null}

              {graph.truncated ? (
                <p className="mt-3 text-[10.5px] text-ink-muted">
                  This neighborhood reached a traversal cap. Narrow the relation
                  or derivation filter before expanding further.
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-line bg-surface-1 px-4 py-8 text-center text-[12px] text-ink-muted">
              The selected entity is no longer available in this workspace.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
