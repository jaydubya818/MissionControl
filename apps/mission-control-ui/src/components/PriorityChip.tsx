import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  ArrowUp,
  Minus,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

const PRIORITY_CONFIG: Record<number, {
  label: string;
  icon: LucideIcon;
  classes: string;
}> = {
  1: {
    label: "Critical",
    icon: AlertOctagon,
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  2: {
    label: "High",
    icon: ArrowUp,
    classes: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  3: {
    label: "Normal",
    icon: Minus,
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  4: {
    label: "Low",
    icon: ArrowDown,
    classes: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  },
};

interface PriorityChipProps {
  priority: number;
  size?: "sm" | "md";
  className?: string;
}

export function PriorityChip({ priority, size = "sm", className }: PriorityChipProps) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[3];
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
