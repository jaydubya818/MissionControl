import { cn } from "@/lib/utils";

export interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-5",
        className
      )}
    >
      <div className="h-3 w-24 rounded skeleton-shimmer mb-4" />
      <div className="h-7 w-16 rounded skeleton-shimmer mb-4" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-2 rounded skeleton-shimmer"
            style={{ width: `${85 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export interface SkeletonLineProps {
  className?: string;
  width?: string;
}

export function SkeletonLine({ className, width = "100%" }: SkeletonLineProps) {
  return (
    <div
      className={cn("h-3 rounded skeleton-shimmer", className)}
      style={{ width }}
    />
  );
}
