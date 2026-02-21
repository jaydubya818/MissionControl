import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  UserCheck,
  Play,
  Eye,
  ShieldAlert,
  Ban,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type TaskStatus =
  | "INBOX"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "NEEDS_APPROVAL"
  | "BLOCKED"
  | "FAILED"
  | "DONE"
  | "CANCELED";

const STATUS_CONFIG: Record<TaskStatus, {
  label: string;
  icon: LucideIcon;
  classes: string;
}> = {
  INBOX: {
    label: "Inbox",
    icon: Inbox,
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  ASSIGNED: {
    label: "Assigned",
    icon: UserCheck,
    classes: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Play,
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  REVIEW: {
    label: "Review",
    icon: Eye,
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  NEEDS_APPROVAL: {
    label: "Needs Approval",
    icon: ShieldAlert,
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  BLOCKED: {
    label: "Blocked",
    icon: Ban,
    classes: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  FAILED: {
    label: "Failed",
    icon: AlertTriangle,
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  DONE: {
    label: "Done",
    icon: CheckCircle2,
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  CANCELED: {
    label: "Canceled",
    icon: XCircle,
    classes: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  },
};

interface StatusChipProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusChip({ status, size = "sm", className }: StatusChipProps) {
  const config = STATUS_CONFIG[status as TaskStatus];
  if (!config) {
    return (
      <Badge variant="outline" className={cn("text-[10px]", className)}>
        {status}
      </Badge>
    );
  }

  const Icon = config.icon;
  const isSm = size === "sm";

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border gap-1",
        config.classes,
        isSm ? "text-[10px] h-5 px-1.5" : "text-xs h-6 px-2",
        className
      )}
    >
      <Icon className={isSm ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {config.label}
    </Badge>
  );
}
