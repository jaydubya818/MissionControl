import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { cn } from "../../lib/utils";

export interface MetadataEntry {
  label: string;
  value: ReactNode;
}

/** Right-hand metadata rail: stacked label/value entries with separators. */
export function MetadataPanel({
  entries,
  children,
  className,
}: {
  entries: MetadataEntry[];
  children?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <aside className={cn("flex w-[280px] shrink-0 flex-col gap-4", className)}>
      <dl className="flex flex-col divide-y divide-line">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-1 py-3 first:pt-0">
            <dt className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
              {entry.label}
            </dt>
            <dd className="text-[13px] text-ink">{entry.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </aside>
  );
}

export interface DetailTab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export function DetailTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: DetailTab[];
  activeId: string;
  onChange: (id: string) => void;
}): JSX.Element {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-line">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-colors duration-150",
              active
                ? "border-registry-accent text-ink font-medium"
                : "border-transparent text-ink-muted hover:text-ink-secondary"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface DetailLayoutProps {
  breadcrumbs?: Crumb[];
  title: string;
  description?: string;
  /** Top-right action area (install button, command snippet, …) */
  actions?: ReactNode;
  /** Metric row under the header (use MetricRow + MetricBlock) */
  metrics?: ReactNode;
  tabs?: DetailTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  /** Right-hand rail (use MetadataPanel) */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Canonical detail-page skeleton: breadcrumbs → header → metric row →
 * tabs → main content + right metadata rail.
 */
export function DetailLayout({
  breadcrumbs,
  title,
  description,
  actions,
  metrics,
  tabs,
  activeTabId,
  onTabChange,
  aside,
  children,
}: DetailLayoutProps): JSX.Element {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-6 py-5">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-ink-secondary">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {metrics}
      {tabs && activeTabId && onTabChange && (
        <DetailTabs tabs={tabs} activeId={activeTabId} onChange={onTabChange} />
      )}
      <div className="flex gap-8">
        <div className="min-w-0 flex-1">{children}</div>
        {aside}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-6 px-6 pb-4 pt-5">
      <div className="min-w-0">
        {eyebrow ? <div className="registry-kicker">{eyebrow}</div> : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
