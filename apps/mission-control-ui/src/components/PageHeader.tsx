import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { normalizeNarrativeText } from "@/lib/displayText";

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
      <div className="relative px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
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
                    <h1 className="text-[23px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">
                      {title}
                    </h1>
                    {status}
                  </div>
                  {description ? (
                    <p className="mt-1.5 max-w-3xl whitespace-pre-line text-[14px] leading-relaxed text-ink-secondary">
                      {normalizeNarrativeText(description)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            {actions ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 2xl:max-w-[48%] 2xl:justify-end",
                  !description && "2xl:self-center"
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
