import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export interface WorkOrderReadinessProjection {
  evaluatedAt: number;
  workOrderRevision: number;
  admissionEligible: boolean;
  checks: Array<{ code: string; label: string; status: string; boundary: string; reason: string }>;
  configurationDigest: string | null;
  modelRouteDigest: string | null;
  harnessDigest: string | null;
  runtimeArtifactDigest: string | null;
  executionBackend: string | null;
}

export function WorkOrderReadinessPanel({ readiness, onRefresh }: {
  readiness: WorkOrderReadinessProjection | undefined;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const stale = Boolean(readiness && now - readiness.evaluatedAt > 30_000);
  return <section aria-label="WorkOrder execution readiness" className="mb-4 space-y-3 rounded-md border border-border bg-muted/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">WorkOrder execution readiness</h3>
        <p role="status" className="text-xs text-muted-foreground">
          {!readiness ? "Checking current WorkOrder authority…" : stale ? "Snapshot expired — refresh checks before requesting preparation."
            : readiness.admissionEligible ? "Admission checks passed; worker preparation and independent proof still required."
              : "Admission blocked — resolve the specific checks below."}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onRefresh}>Refresh checks</Button>
    </div>
    {readiness ? <>
      <p className="text-xs text-muted-foreground">Revision {readiness.workOrderRevision} · Checked {new Date(readiness.evaluatedAt).toLocaleTimeString()}. This inspection grants no execution or acceptance authority.</p>
      <ul className="space-y-2">
        {readiness.checks.filter((check) => check.status !== "PASS").map((check) => <li key={check.code} className="rounded border border-border bg-background p-2 text-xs">
          <div className="font-medium">{check.label} · {check.status === "DEFERRED" ? "Proof pending" : check.status.replace(/_/g, " ")}</div>
          <p className="mt-1 text-muted-foreground">{check.reason}</p>
          <p className="mt-1 break-words text-muted-foreground">{check.boundary.replace(/_/g, " ")} · {check.code}</p>
        </li>)}
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer rounded py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Passed checks and exact identities</summary>
        <ul className="mt-2 space-y-1">{readiness.checks.filter((check) => check.status === "PASS").map((check) => <li key={check.code}>{check.label} · PASS</li>)}</ul>
        <dl className="mt-3 space-y-2">{[
          ["Factory configuration", readiness.configurationDigest], ["Model route", readiness.modelRouteDigest],
          ["Harness", readiness.harnessDigest], ["Runtime artifact", readiness.runtimeArtifactDigest], ["Backend", readiness.executionBackend],
        ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value ?? "UNKNOWN — no current binding"}</dd></div>)}</dl>
      </details>
    </> : null}
  </section>;
}
