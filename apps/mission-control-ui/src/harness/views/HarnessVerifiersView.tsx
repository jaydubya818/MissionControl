import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { HarnessPage } from "../components/HarnessUi";
import { HarnessVerifierEconomics } from "../components/HarnessVerifierEconomics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HarnessVerifiersView({ projectId }: { projectId: Id<"projects"> | null }): JSX.Element {
  const verifiers = useQuery(api.context.verifiers.list, {
    projectId: projectId ?? undefined,
    activeOnly: false,
  });
  const stale = useQuery(api.context.verifiers.ruleDecayCandidates, {
    projectId: projectId ?? undefined,
  });
  const create = useMutation(api.context.verifiers.create);
  const [label, setLabel] = useState("");
  const [invariant, setInvariant] = useState("");

  const handleCreate = async () => {
    if (!label.trim() || !invariant.trim()) return;
    await create({
      projectId: projectId ?? undefined,
      label: label.trim(),
      invariant: invariant.trim(),
      globPatterns: ["**/*"],
      idempotencyKey: `verifier-${label}-${Date.now()}`,
      actorId: "harness-ui",
    });
    setLabel("");
    setInvariant("");
  };

  return (
    <HarnessPage
      title="Verifiers"
      description="Targeted LLM lint rules — skill adherence at PR boundary. Never correct the same mistake twice."
      icon={<ShieldCheck className="h-5 w-5 text-registry-accent" />}
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
        <HarnessVerifierEconomics />
        {stale && stale.length > 0 && (
          <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
            <div className="text-sm font-semibold text-ink">Rule decay ({stale.length})</div>
            <p className="mt-1 text-xs text-ink-secondary">Re-evaluate when models change — forgetting is required.</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
              {stale.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {r.label} · model {r.validatedModel}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface-1 p-4">
          <div className="text-sm font-semibold text-ink">Add verifier</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input placeholder="Invariant (e.g. module A must not import B)" value={invariant} onChange={(e) => setInvariant(e.target.value)} />
          </div>
          <Button className="mt-3" size="sm" onClick={() => void handleCreate()}>
            <Plus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Invariant</th>
                <th className="px-4 py-2">Globs</th>
                <th className="px-4 py-2">Pass rate</th>
              </tr>
            </thead>
            <tbody>
              {!verifiers ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-ink-muted">
                    Loading…
                  </td>
                </tr>
              ) : verifiers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-ink-muted">
                    No verifiers yet. Generate from a skill on Registry detail.
                  </td>
                </tr>
              ) : (
                verifiers.map((v) => (
                  <tr key={v._id} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium text-ink">{v.label}</td>
                    <td className="max-w-md truncate px-4 py-2 text-ink-secondary">{v.invariant}</td>
                    <td className="px-4 py-2 text-ink-muted">{v.globPatterns.join(", ")}</td>
                    <td className="px-4 py-2 tabular-nums">{v.passRate !== undefined ? `${Math.round(v.passRate * 100)}%` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </HarnessPage>
  );
}
