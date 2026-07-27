import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tessl-style page shell — near-black bg, consistent padding, green accent tokens. */
export function FactoryPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <main
      className={cn(
        "factory-page registry-page flex min-h-0 flex-1 flex-col overflow-hidden bg-app",
        className
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4">
        {children}
      </div>
    </main>
  );
}

export function FactoryPageHeader({
  kicker,
  title,
  description,
  actions,
  tabs,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}): JSX.Element {
  return (
    <header className="shrink-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {kicker ? <div className="registry-kicker">{kicker}</div> : null}
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </header>
  );
}

export interface FactoryTabItem {
  id: string;
  label: string;
}

/** Pill tab bar — matches Registry Discover / Evaluate section toggles. */
export function FactoryTabBar({
  tabs,
  activeId,
  onChange,
  ariaLabel = "Page sections",
}: {
  tabs: readonly FactoryTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}): JSX.Element {
  return (
    <div className="factory-tab-bar" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={activeId === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn("factory-tab", activeId === tab.id && "factory-tab-active")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function FactorySection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Elevated card with optional green glow (top skill cards). */
export function FactoryCard({
  children,
  className,
  glow,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "registry-top-card text-left",
        glow && "registry-top-card-glow",
        className
      )}
    >
      {children}
    </Tag>
  );
}
