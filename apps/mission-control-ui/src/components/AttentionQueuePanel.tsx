import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/factory/badges";
import { cn } from "@/lib/utils";
import { exceptionCounts, type AttentionItem } from "@/lib/attentionQueue";

const CARD_CLASS = "rounded-xl border border-line bg-surface-1";

const ACTION_BUTTON =
  "inline-flex h-7 shrink-0 items-center rounded-lg border border-line px-2.5 text-[11.5px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-ink";

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <h2 className="text-[15px] font-semibold text-ink">{children}</h2>;
}

export interface ExceptionSummaryStripProps {
  counts: ReturnType<typeof exceptionCounts>;
  onOpenApprovals?: () => void;
  onOpenTasks?: () => void;
  onOpenAlerts?: () => void;
}

export function ExceptionSummaryStrip({
  counts,
  onOpenApprovals,
  onOpenTasks,
  onOpenAlerts,
}: ExceptionSummaryStripProps): JSX.Element {
  const chips: Array<{
    label: string;
    count: number;
    tone: "warning" | "error" | "success";
    onClick?: () => void;
  }> = [
    { label: "Approvals", count: counts.approvals, tone: "warning", onClick: onOpenApprovals },
    { label: "Blocked", count: counts.blocked, tone: "warning", onClick: onOpenTasks },
    { label: "Failed", count: counts.failed, tone: "error", onClick: onOpenTasks },
    { label: "Alerts", count: counts.alerts, tone: "error", onClick: onOpenAlerts },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line pb-4">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.onClick}
          disabled={!chip.onClick}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2 text-left transition-colors duration-150",
            chip.onClick && chip.count > 0 && "hover:border-line-strong hover:bg-surface-2",
            chip.onClick ? "cursor-pointer" : "cursor-default"
          )}
        >
          <span className="text-[12.5px] text-ink-muted">{chip.label}</span>
          <span className="text-[15px] font-semibold text-ink">{chip.count}</span>
          {chip.count > 0 ? (
            <StatusBadge tone={chip.tone === "success" ? "success" : chip.tone}>Open</StatusBadge>
          ) : (
            <StatusBadge tone="success">Clear</StatusBadge>
          )}
        </button>
      ))}
    </div>
  );
}

export interface NeedsAttentionCardProps {
  items: AttentionItem[];
  scannedAt: number;
}

export function NeedsAttentionCard({
  items,
  scannedAt,
}: NeedsAttentionCardProps): JSX.Element {
  const scanLabel = new Date(scannedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className={cn(CARD_CLASS, "flex flex-col")}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <SectionTitle>Needs attention</SectionTitle>
        {items.length > 0 ? (
          <span className="text-[12.5px] text-ink-muted">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-muted">Last scan {scanLabel}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-8">
          <ShieldCheck className="h-5 w-5 shrink-0 text-ok" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-ink">All clear</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              No blocked work, pending approvals, or open alerts. Last scan {scanLabel}.
            </p>
          </div>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b border-line last:border-b-0">
              <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={item.onOpen}
                  disabled={!item.onOpen}
                  className={cn(
                    "group min-w-0 flex-1 text-left transition-colors duration-150",
                    item.onOpen ? "hover:opacity-90" : "cursor-default"
                  )}
                >
                  <div className="truncate text-[13px] font-medium text-ink">{item.title}</div>
                  {item.detail && (
                    <div className="mt-0.5 truncate text-[12.5px] text-ink-muted">{item.detail}</div>
                  )}
                </button>
                <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                  <StatusBadge tone={item.badgeTone}>{item.badgeLabel}</StatusBadge>
                  {item.onApprove && (
                    <button
                      type="button"
                      className={ACTION_BUTTON}
                      onClick={() => void item.onApprove?.()}
                    >
                      Approve
                    </button>
                  )}
                  {item.onUnblock && (
                    <button
                      type="button"
                      className={ACTION_BUTTON}
                      onClick={() => void item.onUnblock?.()}
                    >
                      Unblock
                    </button>
                  )}
                  {item.onOpen && (
                    <button type="button" className={ACTION_BUTTON} onClick={item.onOpen}>
                      Open
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface AttentionQueuePanelProps {
  items: AttentionItem[];
  scannedAt: number;
  counts: ReturnType<typeof exceptionCounts>;
  onOpenApprovals?: () => void;
  onOpenTasks?: () => void;
  onOpenAlerts?: () => void;
}

/** Exception-first operator block: summary strip + actionable attention queue. */
export function AttentionQueuePanel({
  items,
  scannedAt,
  counts,
  onOpenApprovals,
  onOpenTasks,
  onOpenAlerts,
}: AttentionQueuePanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <NeedsAttentionCard items={items} scannedAt={scannedAt} />
      <ExceptionSummaryStrip
        counts={counts}
        onOpenApprovals={onOpenApprovals}
        onOpenTasks={onOpenTasks}
        onOpenAlerts={onOpenAlerts}
      />
    </div>
  );
}
