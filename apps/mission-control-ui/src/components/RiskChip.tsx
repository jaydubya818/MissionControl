import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";

type RiskLevel = "GREEN" | "YELLOW" | "RED";

const RISK_CONFIG: Record<RiskLevel, {
  label: string;
  icon: LucideIcon;
  classes: string;
}> = {
  GREEN: {
    label: "Low Risk",
    icon: ShieldCheck,
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  YELLOW: {
    label: "Medium Risk",
    icon: Shield,
    classes: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  RED: {
    label: "High Risk",
    icon: ShieldAlert,
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

interface RiskChipProps {
  level: string;
  size?: "sm" | "md";
  className?: string;
}

export function RiskChip({ level, size = "sm", className }: RiskChipProps) {
  const config = RISK_CONFIG[level as RiskLevel];
  if (!config) {
    return (
      <Badge variant="outline" className={cn("text-[10px]", className)}>
        {level}
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
