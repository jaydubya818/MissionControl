/**
 * Loop Detection Panel
 *
 * Shows loop-detected alerts (comment storms, review ping-pong, repeated failures)
 * and provides one-click actions to acknowledge, resolve, or unblock tasks.
 */

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MessageSquareWarning,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
  Clock,
} from "lucide-react";

interface LoopDetectionPanelProps {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

type LoopType = "COMMENT_STORM" | "REVIEW_PING_PONG" | "BACK_AND_FORTH" | "REPEATED_FAILURES";

const LOOP_TYPE_INFO: Record<
  string,
  { icon: React.ReactNode; label: string; description: string; colorClass: string; borderClass: string }
> = {
  COMMENT_STORM: {
    icon: <MessageSquareWarning className="h-4 w-4" strokeWidth={1.75} />,
    label: "Comment Storm",
    description: "Too many messages in a short window",
    colorClass: "text-warn",
    borderClass: "border-warn",
  },
  REVIEW_PING_PONG: {
    icon: <RefreshCw className="h-4 w-4" strokeWidth={1.75} />,
    label: "Review Ping-Pong",
    description: "Excessive review cycles without resolution",
    colorClass: "text-err",
    borderClass: "border-err",
  },
  BACK_AND_FORTH: {
    icon: <Zap className="h-4 w-4" strokeWidth={1.75} />,
    label: "State Churn",
    description: "Task repeatedly bouncing between states",
    colorClass: "text-warn",
    borderClass: "border-warn",
  },
  REPEATED_FAILURES: {
    icon: <XCircle className="h-4 w-4" strokeWidth={1.75} />,
    label: "Repeated Failures",
    description: "Same operation failing repeatedly",
    colorClass: "text-err",
    borderClass: "border-err",
  },
};

const SEVERITY_CONFIG: Record<string, { label: string; tone: StatusBadgeProps["tone"] }> = {
  CRITICAL: { label: "Critical", tone: "error" },
  WARNING: { label: "Warning", tone: "warning" },
  INFO: { label: "Info", tone: "info" },
};

export function LoopDetectionPanel({
  projectId,
  onTaskSelect,
}: LoopDetectionPanelProps) {
  const [filter, setFilter] = useState<"all" | "OPEN" | "ACKNOWLEDGED">("all");
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const openAlerts = useQuery(
    api.alerts.listOpen,
    projectId ? { projectId, limit: 100 } : "skip",
  );
  const acknowledgeAlert = useAction(api.alerts.acknowledge);
  const resolveAlert = useAction(api.alerts.resolve);
  const ignoreAlert = useAction(api.alerts.ignore);
  const transitionTask = useAction(api.tasks.transition);

  const loopAlerts = (openAlerts ?? []).filter((a) => a.type === "LOOP_DETECTED");
  const filteredAlerts = filter === "all" ? loopAlerts : loopAlerts.filter((a) => a.status === filter);
  const hasLoopAlerts = loopAlerts.length > 0;
  const openCount = loopAlerts.filter((a) => a.status === "OPEN").length;
  const acknowledgedCount = loopAlerts.filter((a) => a.status === "ACKNOWLEDGED").length;

  const summary = useMemo(
    () =>
      Object.entries(LOOP_TYPE_INFO).map(([type, info]) => ({
        type: type as LoopType,
        info,
        count: loopAlerts.filter(
          (a) => (a.metadata as Record<string, unknown> & { loopData?: { type?: string } })?.loopData?.type === type || a.title.includes(type)
        ).length,
      })),
    [loopAlerts]
  );

  const activeSummary = summary.filter((item) => item.count > 0);

  const handleAcknowledge = async (alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await acknowledgeAlert({ alertId });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await resolveAlert({ alertId, resolutionNote: "Resolved via Loop Detection Panel" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleIgnore = async (alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await ignoreAlert({ alertId, reason: "Ignored via Loop Detection Panel" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnblockTask = async (taskId: Id<"tasks">, alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await transitionTask({
        taskId,
        toStatus: "READY",
        actorType: "HUMAN",
        reason: "Unblocked from Loop Detection Panel",
        blockerResolution: {
          resolution: "RESOLVED",
          reason: "Loop condition reviewed and cleared by the operator",
        },
        idempotencyKey: `unblock-loop-${taskId}-${Date.now()}`,
      });
      await resolveAlert({ alertId, resolutionNote: "Task unblocked by operator" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="mx-4 my-3 shrink-0 rounded-xl border border-line bg-surface-1">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 transition-colors duration-150",
          expanded ? "rounded-t-xl" : "rounded-xl",
          "hover:bg-surface-2"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <span className={cn("h-2 w-2 rounded-full", hasLoopAlerts ? "bg-warn" : "bg-ok")} />

          <div className="flex items-center gap-2">
            <ShieldAlert
              className={cn("h-4 w-4", hasLoopAlerts ? "text-warn" : "text-ink-muted")}
              strokeWidth={1.75}
            />
            <span className="text-[13.5px] font-semibold text-ink">Loop Risk Monitor</span>
          </div>

          {hasLoopAlerts ? (
            <div className="flex items-center gap-1.5">
              {openCount > 0 && <StatusBadge tone="error">{openCount} open</StatusBadge>}
              {acknowledgedCount > 0 && (
                <StatusBadge tone="neutral">{acknowledgedCount} acknowledged</StatusBadge>
              )}
            </div>
          ) : (
            <StatusBadge tone="success">All clear</StatusBadge>
          )}
        </div>

        <div className="flex items-center gap-2 text-ink-muted">
          {hasLoopAlerts && activeSummary.length > 0 && (
            <div className="flex items-center gap-1 mr-1">
              {activeSummary.map(({ type, info, count }) => (
                <span
                  key={type}
                  className={cn(
                    "flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px]",
                    info.colorClass
                  )}
                >
                  {info.icon}
                  <span className="font-semibold">{count}</span>
                </span>
              ))}
            </div>
          )}
          {expanded
            ? <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
            : <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          }
        </div>
      </button>

      {/* Divider only when expanded */}
      {expanded && <div className="h-px mx-4 bg-line" />}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          {!hasLoopAlerts ? (
            /* All-clear state */
            <div className="space-y-3">
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-ok" strokeWidth={1.75} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13.5px] font-semibold text-ink">No active loop incidents</span>
                      <StatusBadge tone="success">Stable</StatusBadge>
                    </div>
                    <p className="text-[12.5px] text-ink-muted leading-relaxed">
                      Comment storms and state churn are currently stable.
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11.5px] text-ink-muted">Last scan</div>
                    <div className="text-[12.5px] font-medium text-ink-secondary mt-0.5">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-monitor health rows */}
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(LOOP_TYPE_INFO).map(([type, info]) => (
                  <div
                    key={type}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 transition-colors duration-150 hover:border-line-strong"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-semibold text-ink-secondary truncate">{info.label}</div>
                      <div className="text-[11.5px] text-ink-muted mt-0.5">0 incidents</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer note */}
              <div className="flex items-center gap-2 px-1 text-[11.5px] text-ink-muted">
                <Clock className="h-3 w-3" strokeWidth={1.75} />
                <span>Loop detection scans every 5 minutes · Powered by Convex cron</span>
              </div>
            </div>
          ) : (
            <>
              {/* Filter tabs */}
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5">
                {(["all", "OPEN", "ACKNOWLEDGED"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "h-7 px-3 rounded-md text-xs font-medium transition-colors duration-150",
                      filter === f
                        ? "bg-surface-2 text-ink"
                        : "text-ink-muted hover:text-ink"
                    )}
                  >
                    {f === "all" ? "All" : f === "OPEN" ? `Open (${openCount})` : `Acknowledged (${acknowledgedCount})`}
                  </button>
                ))}
              </div>

              {filteredAlerts.length === 0 ? (
                <div className="px-4 py-3 rounded-lg border border-dashed border-line text-xs text-ink-muted">
                  No incidents for this filter.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredAlerts.map((alert) => {
                    const loopData = (alert.metadata as Record<string, unknown> & { loopData?: Record<string, unknown> })?.loopData;
                    const loopType = (loopData as { type?: string })?.type ?? "UNKNOWN";
                    const info = LOOP_TYPE_INFO[loopType] ?? {
                      icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />,
                      label: loopType,
                      description: "",
                      colorClass: "text-warn",
                      borderClass: "border-warn",
                    };
                    const severityConfig = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.INFO;
                    const isLoading = actionLoading === alert._id;

                    return (
                      <div
                        key={alert._id}
                        className={cn(
                          "rounded-lg border-l-2 border border-line bg-surface-1 p-3 space-y-2.5",
                          info.borderClass.replace("border-", "border-l-")
                        )}
                      >
                        {/* Alert header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <span className={cn("mt-0.5 shrink-0", info.colorClass)}>{info.icon}</span>
                            <div>
                              <div className="text-[13.5px] font-semibold text-ink leading-tight">{alert.title}</div>
                              <div className="text-[11.5px] text-ink-muted mt-0.5">
                                {new Date(alert._creationTime).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <StatusBadge tone={severityConfig.tone} className="shrink-0">
                            {severityConfig.label}
                          </StatusBadge>
                        </div>

                        {/* Description */}
                        <p className="text-[12.5px] text-ink-secondary leading-relaxed">{alert.description}</p>

                        {/* Loop detail chips */}
                        {loopData && (
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { label: "Count", value: String((loopData as { count?: unknown }).count) },
                              { label: "Threshold", value: String((loopData as { threshold?: unknown }).threshold) },
                              (loopData as { window?: unknown }).window
                                ? { label: "Window", value: `${(loopData as { window: unknown }).window} min` }
                                : null,
                              (loopData as { detail?: unknown }).detail
                                ? { label: "Detail", value: String((loopData as { detail: unknown }).detail) }
                                : null,
                            ]
                              .filter(Boolean)
                              .map((item) => (
                                <div
                                  key={item!.label}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-2 border border-line"
                                >
                                  <span className="text-[11.5px] text-ink-muted font-medium">{item!.label}</span>
                                  <span className="text-[11.5px] font-semibold text-ink">{item!.value}</span>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {alert.taskId && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs px-3"
                                disabled={isLoading}
                                onClick={() => handleUnblockTask(alert.taskId as Id<"tasks">, alert._id)}
                              >
                                {isLoading ? "Working…" : "Unblock Task"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-3"
                                onClick={() => onTaskSelect?.(alert.taskId as Id<"tasks">)}
                              >
                                View Task
                              </Button>
                            </>
                          )}
                          {alert.status === "OPEN" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-3"
                              disabled={isLoading}
                              onClick={() => handleAcknowledge(alert._id)}
                            >
                              Acknowledge
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-3"
                            disabled={isLoading}
                            onClick={() => handleResolve(alert._id)}
                          >
                            Resolve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-3 text-ink-muted"
                            disabled={isLoading}
                            onClick={() => handleIgnore(alert._id)}
                          >
                            Ignore
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
