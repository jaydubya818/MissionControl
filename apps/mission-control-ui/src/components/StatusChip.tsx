import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";

type TaskStatus =
  | "INBOX"
  | "READY"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "NEEDS_APPROVAL"
  | "BLOCKED"
  | "FAILED"
  | "DONE"
  | "CANCELED";

/** Task-state → badge tone mapping per UI_STYLE_GUIDE.md. */
const STATUS_CONFIG: Record<TaskStatus, { label: string; tone: StatusBadgeProps["tone"] }> = {
  INBOX: { label: "Inbox", tone: "neutral" },
  READY: { label: "Ready", tone: "info" },
  ASSIGNED: { label: "Ready (legacy)", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  REVIEW: { label: "Review", tone: "info" },
  NEEDS_APPROVAL: { label: "Needs Approval", tone: "warning" },
  BLOCKED: { label: "Blocked", tone: "warning" },
  FAILED: { label: "Failed", tone: "error" },
  DONE: { label: "Done", tone: "success" },
  CANCELED: { label: "Canceled", tone: "neutral" },
};

interface StatusChipProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusChip({ status, size = "sm", className }: StatusChipProps): JSX.Element {
  const config = STATUS_CONFIG[status as TaskStatus];
  const sizeClass = size === "md" ? "text-[12.5px]" : undefined;

  if (!config) {
    return (
      <StatusBadge tone="neutral" className={cn(sizeClass, className)}>
        {status}
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone={config.tone} className={cn(sizeClass, className)}>
      {config.label}
    </StatusBadge>
  );
}
