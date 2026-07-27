import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
  /** Uppercase green kicker — Tessl / registry pattern */
  eyebrow?: string;
  /** Optional pill tab bar below header */
  tabs?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  status,
  icon,
  eyebrow,
  tabs,
}: PageHeaderProps): JSX.Element {
  return (
    <header className="relative shrink-0 border-b border-line bg-app">
      <div className="relative px-6 py-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              {eyebrow ? <div className="registry-kicker">{eyebrow}</div> : null}
              <div className="flex min-w-0 items-start gap-3">
                {icon ? (
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-1 text-registry-accent">
                    {icon}
                  </div>
                ) : null}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
                      {title}
                    </h1>
                    {status}
                  </div>
                  {description ? (
                    <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-secondary">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {actions ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 xl:max-w-[48%] xl:justify-end",
                  !description && "xl:self-center"
                )}
              >
                {actions}
              </div>
            ) : null}
          </div>
          {tabs}
        </div>
      </div>
    </header>
  );
}
