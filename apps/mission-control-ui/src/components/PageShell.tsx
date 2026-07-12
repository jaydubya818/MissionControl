import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Full-page scroll shell for dashboards and document views. */
export function PageScrollShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto bg-app", className)}>
      {children}
    </main>
  );
}

/** Board/canvas shell: fixed chrome + flex-1 primary content. */
export function PageBoardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-app", className)}>
      {children}
    </main>
  );
}

/** Primary content pane below headers/filters in board views. */
export function PageBoardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>{children}</div>
  );
}

/** Horizontal filter/toolbar row — single line with scroll. */
export function PageToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 border-b border-line bg-app px-4 py-2", className)}>
      <div className="flex items-center gap-3 overflow-x-auto flex-nowrap">{children}</div>
    </div>
  );
}
