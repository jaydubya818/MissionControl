import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleSlash2,
  Fingerprint,
  FlaskConical,
  Loader2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { StatusBadge } from "../../components/factory/badges";
import { cn } from "../../lib/utils";
import {
  evalCaseTone,
  evalNextAction,
  evalVerdictTone,
  shortEvalDigest,
} from "../evalControlPlaneViewModel";

type EvalDashboard = FunctionReturnType<typeof api.evalControlPlane.getDashboard>;
type EvalRun = EvalDashboard["recentRuns"][number];

export function EvalControlPlanePanel({ projectId }: { projectId: Id<"projects"> }) {
  const dashboard = useQuery(api.evalControlPlane.getDashboard, { projectId });
  const installSuite = useMutation(api.evalControlPlane.installGoldenSuiteV1);
  const [installState, setInstallState] = useState<{ status: "idle" | "installing" | "success" | "error"; message?: string }>({ status: "idle" });

  async function install() {
    setInstallState({ status: "installing" });
    try {
      const result = await installSuite({ projectId });
      setInstallState({
        status: "success",
        message: result.created ? "Golden suite installed. Submit a complete runner receipt to establish current health." : "Golden suite is already installed.",
      });
    } catch (error) {
      setInstallState({ status: "error", message: error instanceof Error ? error.message : "Suite installation failed." });
    }
  }

  if (dashboard === undefined) {
    return (
      <section className="mx-4 mt-4 rounded-xl border border-line bg-surface-1 p-5 sm:mx-6" aria-busy="true" aria-label="Loading eval health">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-muted"><Loader2 size={15} className="animate-spin" aria-hidden /> Loading receipt integrity and baseline health…</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>
      </section>
    );
  }

  if (!dashboard.activeSuite) {
    return (
      <section className="mx-4 mt-4 rounded-xl border border-dashed border-line-strong bg-surface-1 p-6 sm:mx-6" aria-labelledby="eval-control-empty-title">
        <div className="flex max-w-3xl items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-muted"><FlaskConical size={17} aria-hidden /></div>
          <div>
            <div className="registry-kicker">Eval control plane</div>
            <h2 id="eval-control-empty-title" className="mt-1 text-[15px] font-semibold text-ink">No governed eval suite is installed</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">Install the versioned Mission Control golden suite to track exact intent, bounded authority, current evidence, recovery, harness provenance, and advisory economics. This adds diagnostic evidence only; it cannot approve or accept work.</p>
            <button type="button" onClick={() => void install()} disabled={installState.status === "installing"} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-action-primary px-3 text-[12px] font-medium text-action-primary-text disabled:cursor-not-allowed disabled:opacity-50">
              {installState.status === "installing" ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ShieldCheck size={13} aria-hidden />}
              {installState.status === "installing" ? "Installing…" : installState.status === "error" ? "Retry installation" : "Install golden suite"}
            </button>
          </div>
        </div>
        {installState.message ? <div role={installState.status === "error" ? "alert" : "status"} className={cn("mt-4 rounded-lg border px-3 py-2 text-[12px]", installState.status === "error" ? "border-err/30 bg-err-soft text-err" : "border-ok/30 bg-ok-soft text-ok")}>{installState.message}</div> : null}
      </section>
    );
  }

  const latest = dashboard.latestRun;
  const metrics = latest?.metrics ?? null;
  const regressions = Array.isArray(latest?.regressions) ? latest.regressions : [];
  const results = Array.isArray(latest?.results) ? latest.results : [];
  const blockingRegressions = regressions.filter((regression: any) => regression?.blocking).length;
  const invalidCases = results.filter((result: any) => result?.verdict === "INVALID" || result?.verdict === "SKIPPED").length;
  const advisoryFailures = results.filter((result: any) => result?.severity === "ADVISORY" && result?.verdict !== "PASS").length;
  const nextAction = evalNextAction({ verdict: latest?.verdict, blockingRegressions, invalidCases, advisoryFailures });

  return (
    <section className="mx-4 mt-4 overflow-hidden rounded-xl border border-line bg-surface-1 sm:mx-6" aria-labelledby="eval-health-title">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <div className="registry-kicker">Eval control plane</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="eval-health-title" className="text-[15px] font-semibold text-ink">Eval health</h2>
            <StatusBadge tone={evalVerdictTone(latest?.verdict)}>{latest?.verdict ?? "Awaiting first run"}</StatusBadge>
            {latest?.publishable ? <StatusBadge tone="info">Receipt publishable</StatusBadge> : null}
          </div>
          <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-ink-muted">{dashboard.activeSuite.name} v{dashboard.activeSuite.version} · {dashboard.activeSuite.caseCount} sealed cases · baseline {dashboard.activeBaseline?.baselineId ?? "not established"}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted"><LockKeyhole size={12} aria-hidden /> No execution or acceptance authority</div>
      </header>

      <div className="grid border-b border-line sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="Eval health metrics">
        <HealthMetric label="Blocking health" value={metrics ? `${metrics.blockingPassed ?? 0}/${metrics.blockingCases ?? 0}` : "—"} detail="Must not regress" tone={(metrics?.blockingPassed ?? 0) === (metrics?.blockingCases ?? -1) ? "success" : "error"} />
        <HealthMetric label="Advisory health" value={metrics ? `${metrics.advisoryPassed ?? 0}/${metrics.advisoryCases ?? 0}` : "—"} detail={advisoryFailures ? `${advisoryFailures} known gap` : "No known gaps"} tone={advisoryFailures ? "warning" : "success"} />
        <HealthMetric label="Regressions" value={String(regressions.length)} detail={blockingRegressions ? `${blockingRegressions} blocking` : "Against pinned baseline"} tone={blockingRegressions ? "error" : "success"} />
        <HealthMetric label="Invalid runs" value={String(dashboard.health.invalidRuns)} detail={`Last ${dashboard.health.totalRuns} runs`} tone={dashboard.health.invalidRuns ? "warning" : "success"} />
        <HealthMetric label="Negative controls" value={`${dashboard.activeSuite.caseCount} declared`} detail="Verified by hermetic CI" tone="success" />
      </div>

      <div className={cn("flex items-start gap-2.5 border-b border-line px-4 py-3 text-[12px]", latest?.verdict === "FAIL" || latest?.verdict === "INVALID" ? "bg-err-soft/45" : latest?.verdict === "WARN" ? "bg-warn-soft/40" : "bg-ok-soft/35")}>
        {latest?.verdict === "PASS" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />}
        <div><span className="font-medium text-ink">Next action:</span> <span className="text-ink-secondary">{nextAction}</span></div>
      </div>

      {!latest ? (
        <div className="p-8 text-center"><CircleSlash2 size={21} className="mx-auto text-ink-muted" aria-hidden /><h3 className="mt-2 text-[13px] font-semibold text-ink">Suite installed; no receipt recorded</h3><p className="mx-auto mt-1 max-w-xl text-[12px] text-ink-muted">Run the keyless golden-suite adapter against exact System Qualification evidence, then submit all case outcomes with pinned provenance.</p></div>
      ) : (
        <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="min-w-0 xl:border-r xl:border-line">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><h3 className="text-[12.5px] font-semibold text-ink">Latest receipt cases</h3><p className="mt-0.5 text-[10.5px] text-ink-muted">Case failures remain distinct from harness, judge, data, and infrastructure failures.</p></div><span className="font-mono text-[10px] text-ink-muted">{shortEvalDigest(latest.receiptDigest)}</span></div>
            <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-accent/40" role="region" tabIndex={0} aria-label="Latest eval receipt case results">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.07em] text-ink-muted"><tr><th className="px-4 py-2 font-medium">Case</th><th className="px-3 py-2 font-medium">Slices</th><th className="px-3 py-2 font-medium">Verdict</th><th className="px-3 py-2 font-medium">Score</th><th className="px-3 py-2 font-medium">Failure origin</th><th className="px-3 py-2 font-medium">Evidence</th></tr></thead>
                <tbody className="divide-y divide-line">{results.map((result: any) => <tr key={result.caseKey} className="text-[11.5px]"><td className="px-4 py-3"><div className="font-medium text-ink">{result.caseName}</div><div className="mt-0.5 font-mono text-[9.5px] text-ink-muted">{result.caseKey}</div>{result.failedAssertionCodes?.length ? <div className="mt-1 text-[10px] text-err">{result.failedAssertionCodes.join(", ")}</div> : null}</td><td className="px-3 py-3 text-ink-secondary">{result.slices?.join(" · ")}</td><td className="px-3 py-3"><StatusBadge tone={evalCaseTone(result.verdict)}>{result.verdict}</StatusBadge></td><td className="px-3 py-3 font-mono text-ink">{typeof result.score === "number" ? `${Math.round(result.score * 100)}%` : "—"}</td><td className="px-3 py-3 text-ink-secondary">{result.failureOrigin ? humanize(result.failureOrigin) : "—"}</td><td className="px-3 py-3 font-mono text-[10px] text-ink-muted">{result.evidenceRefs?.length ?? 0} refs</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <aside className="min-w-0 bg-surface-2/25 p-4">
            <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink"><Fingerprint size={14} className="text-ink-muted" aria-hidden /> Pinned provenance</h3>
            <dl className="mt-3 space-y-2.5"><Pin label="Revision" value={latest.provenance?.revision} /><Pin label="Adapter" value={`${latest.provenance?.adapter?.id ?? "—"}@${latest.provenance?.adapter?.version ?? "—"}`} /><Pin label="Adapter digest" value={shortEvalDigest(latest.provenance?.adapter?.digest)} /><Pin label="Dataset" value={shortEvalDigest(latest.provenance?.datasetDigest)} /><Pin label="Configuration" value={shortEvalDigest(latest.provenance?.resolvedConfigDigest)} /><Pin label="Seed" value={latest.provenance?.seed} /></dl>
            <details className="mt-4 border-t border-line pt-3"><summary className="flex cursor-pointer list-none items-center justify-between text-[11.5px] font-medium text-ink-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-info-accent/40">Recent receipt history <ChevronDown size={13} aria-hidden /></summary><div className="mt-2 space-y-2">{dashboard.recentRuns.map((run) => <RunHistoryRow key={run._id} run={run} />)}</div></details>
          </aside>
        </div>
      )}
    </section>
  );
}

function HealthMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "success" | "warning" | "error" | "neutral" }) {
  return <div className="border-t border-line px-4 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"><div className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">{label}</div><div className={cn("mt-1 font-mono text-[18px] font-semibold", tone === "success" ? "text-ok" : tone === "warning" ? "text-warn" : tone === "error" ? "text-err" : "text-ink")}>{value}</div><div className="mt-0.5 text-[10.5px] text-ink-muted">{detail}</div></div>;
}

function Pin({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0"><dt className="text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">{label}</dt><dd className="mt-0.5 truncate font-mono text-[10.5px] text-ink-secondary" title={value}>{value ?? "—"}</dd></div>;
}

function RunHistoryRow({ run }: { run: EvalRun }) {
  return <div className="rounded-lg border border-line bg-surface-1 p-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[10px] text-ink-secondary">{run.runKey}</span><StatusBadge tone={evalVerdictTone(run.verdict)}>{run.verdict}</StatusBadge></div><div className="mt-1 flex items-center justify-between text-[9.5px] text-ink-muted"><span>{new Date(run.finishedAt).toLocaleString()}</span><span>{run.publishable ? "Publishable" : "Not publishable"}</span></div>{run.verdict === "INVALID" ? <div className="mt-1.5 flex items-center gap-1 text-[10px] text-err"><RotateCcw size={10} aria-hidden /> Harness/accounting repair required</div> : null}</div>;
}

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/(^|\s)\w/g, (character) => character.toUpperCase());
}
