import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type FactoryContextDetail = {
  contextPackage: {
    contentHash: string;
    estimatedTokens: number;
    generatedAt: number;
    items: Array<{
      chunkId: string;
      sourceId: string;
      sourceType: string;
      reason: string;
      priority: string;
      estimatedTokens: number;
      provenance: { path?: string; revision?: string };
    }>;
  };
  verificationPlan?: {
    advisoryOnly: true;
    checks: Array<{
      id: string;
      name: string;
      evidenceRequired: true;
    }>;
  } | null;
  evaluations: Array<{ _id: string; passed: boolean }>;
};

export function FactoryContextRunCard({
  enabled,
  detail,
}: {
  enabled: boolean | undefined;
  detail: FactoryContextDetail | null | undefined;
}): JSX.Element {
  const state =
    enabled === undefined
      ? "Resolving"
      : !enabled
        ? "Disabled"
        : detail === undefined
          ? "Loading"
          : detail === null
            ? "No package"
            : "Frozen";

  return (
    <Card id="run-factory-context" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">
            Frozen Factory context
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            The bounded, provenance-preserving context snapshot linked to this
            exact Attempt.
          </div>
        </div>
        <Badge variant="outline">{state}</Badge>
      </div>

      {enabled === undefined || (enabled && detail === undefined) ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Resolving the Attempt context snapshot…
        </p>
      ) : !enabled ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Autonomous Context Engineering is off for this workspace. Existing
          execution and verification authority is unchanged.
        </p>
      ) : detail === null ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This Attempt has no frozen Factory Memory package. Legacy and
          pre-rollout Attempts remain valid and inspectable.
        </p>
      ) : detail ? (
        <>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <RunContextMeta
              label="Items / token estimate"
              value={`${detail.contextPackage.items.length} / ${detail.contextPackage.estimatedTokens.toLocaleString()}`}
            />
            <RunContextMeta
              label="Frozen at"
              value={new Date(
                detail.contextPackage.generatedAt,
              ).toLocaleString()}
            />
            <RunContextMeta
              label="Context digest"
              value={detail.contextPackage.contentHash}
            />
            <RunContextMeta
              label="Context evals"
              value={`${detail.evaluations.filter((evaluation) => evaluation.passed).length}/${detail.evaluations.length} passed`}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--panel-line)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--panel-line)] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Revision</th>
                  <th className="px-3 py-2 font-medium">Why selected</th>
                  <th className="px-3 py-2 font-medium">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--panel-line)]">
                {detail.contextPackage.items.slice(0, 8).map((item) => (
                  <tr key={item.chunkId}>
                    <td className="px-3 py-2 text-foreground">
                      <div>{item.sourceId}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {item.sourceType} · {item.priority}
                      </div>
                    </td>
                    <td className="max-w-48 break-all px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {item.provenance.revision ?? "unversioned"}
                    </td>
                    <td className="max-w-80 px-3 py-2 text-muted-foreground">
                      {item.reason}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {item.estimatedTokens} tokens
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.contextPackage.items.length > 8 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {detail.contextPackage.items.length - 8} additional bounded
              sources are available in Knowledge → Memory → Context.
            </p>
          ) : null}

          <div className="mt-4 rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-2">
            <div className="text-xs font-medium text-foreground">
              Advisory verification plan
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {detail.verificationPlan?.checks.length
                ? `${detail.verificationPlan.checks.length} evidence-required checks were influenced by memory. They do not satisfy acceptance criteria.`
                : "No memory-influenced verification checks were recorded. Acceptance still depends on objective evidence."}
            </p>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function RunContextMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-all text-sm text-foreground">{value}</div>
    </div>
  );
}
