import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface AutoRefreshBadgeProps {
  interval?: number;
  active?: boolean;
  className?: string;
}

export function AutoRefreshBadge({
  interval = 15,
  active = true,
  className,
}: AutoRefreshBadgeProps) {
  const [countdown, setCountdown] = useState(interval);

  useEffect(() => {
    if (!active) return;
    setCountdown(interval);
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? interval : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [interval, active]);

  if (!active) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5",
        "rounded-md text-xs font-medium",
        "bg-muted text-muted-foreground",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 status-dot-pulse" />
      Live · {countdown}s
    </span>
  );
}
