import { formatRelativeSeconds } from "@/lib/schematicFormatters";
import { cn } from "@/lib/utils";

export interface SchematicPageHeadProps {
  title: string;
  subtitle?: string;
  updatedAt?: number;
  live?: boolean;
  className?: string;
}

/** Sticky page header with live subline (waku pagehead pattern). */
export function SchematicPageHead({
  title,
  subtitle,
  updatedAt,
  live = true,
  className,
}: SchematicPageHeadProps): JSX.Element {
  return (
    <div
      className={cn(
        "sticky top-0 z-[6] border-b border-line bg-app pb-2.5 pt-7",
        className
      )}
    >
      <h1 className="text-[17px] font-semibold text-ink">{title}</h1>
      <p className="mt-0.5 font-mono text-[12px] text-ink-muted">
        {live ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-schematic-accent opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-schematic-accent" />
            </span>
            live
          </span>
        ) : null}
        {live && (subtitle || updatedAt != null) ? " · " : null}
        {updatedAt != null ? `updated ${formatRelativeSeconds(updatedAt)}` : null}
        {updatedAt != null && subtitle ? " · " : null}
        {subtitle}
      </p>
    </div>
  );
}
