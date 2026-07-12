import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VerificationStatus, VerificationTrace } from "@/lib/verificationTrace";

function StatusIcon({ status }: { status: VerificationStatus }) {
  switch (status) {
    case "pass":
      return <CheckCircle2 className="h-4 w-4 text-ok shrink-0" strokeWidth={1.75} />;
    case "fail":
      return <XCircle className="h-4 w-4 text-err shrink-0" strokeWidth={1.75} />;
    case "pending":
      return <Circle className="h-4 w-4 text-warn shrink-0" strokeWidth={1.75} />;
    case "na":
      return <Circle className="h-4 w-4 text-ink-muted shrink-0" strokeWidth={1.75} />;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "pending":
      return "Pending";
    case "na":
      return "N/A";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function VerificationTracePanel({ trace }: { trace: VerificationTrace }) {
  const { outcome, criteria, evidence, summary } = trace;
  const verdict =
    summary.fail > 0 ? "fail" : summary.pending > 0 ? "pending" : summary.pass > 0 ? "pass" : "pending";

  return (
    <div className="rounded-lg border border-line bg-surface-2 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line bg-surface-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Outcome & proof</p>
          <p className="text-sm text-ink mt-1 leading-relaxed">{outcome}</p>
        </div>
        <div
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase",
            verdict === "pass" && "bg-ok-soft text-ok",
            verdict === "fail" && "bg-err-soft text-err",
            verdict === "pending" && "bg-warn-soft text-warn",
          )}
        >
          <StatusIcon status={verdict} />
          {verdict === "pass" ? "Verified" : verdict === "fail" ? "Failed" : "In progress"}
        </div>
      </div>

      {criteria.length > 0 && (
        <div className="px-4 py-3 border-b border-line">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">
            Acceptance criteria
          </p>
          <ul className="space-y-2">
            {criteria.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <StatusIcon status={item.status} />
                <div className="min-w-0">
                  <p className="text-ink-secondary">{item.label}</p>
                  {item.note && <p className="text-xs text-ink-muted mt-0.5">{item.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">Evidence</p>
        {evidence.length === 0 ? (
          <p className="text-sm text-ink-muted">No runs or approvals recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((row) => (
              <li key={row.id} className="flex items-start gap-2 text-sm">
                <StatusIcon status={row.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-ink truncate">{row.label}</p>
                    <span className="text-[10px] font-medium uppercase text-ink-muted shrink-0">
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  {row.detail && (
                    <p className="text-xs text-ink-muted mt-0.5 truncate">{row.detail}</p>
                  )}
                  {row.at != null && (
                    <p className="text-[10px] text-ink-muted mt-0.5">
                      {new Date(row.at).toLocaleString()}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
