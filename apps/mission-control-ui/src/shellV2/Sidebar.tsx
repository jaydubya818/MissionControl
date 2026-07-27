import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, Command, Search } from "lucide-react";
import type { MainView } from "../TopNav";
import { NAV_GROUPS, type NavGroup, type NavItem } from "./navConfig";
import { cn } from "../lib/utils";

export const SIDEBAR_V2_WIDTH = 256;

interface SidebarItemProps {
  item: NavItem;
  active: boolean;
  onNavigate: (view: MainView) => void;
}

export function SidebarItem({ item, active, onNavigate }: SidebarItemProps): JSX.Element {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.view)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors duration-150",
        active
          ? "bg-registry-accent-soft text-ink ring-1 ring-registry-accent/30"
          : "text-ink-secondary hover:bg-surface-1 hover:text-ink"
      )}
    >
      <Icon size={15} strokeWidth={1.75} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      {item.count != null && item.count > 0 ? (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
          {item.count}
        </span>
      ) : null}
    </button>
  );
}

interface SidebarSectionProps {
  group: NavGroup;
  activeView: MainView;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (view: MainView) => void;
}

export function SidebarSection({
  group,
  activeView,
  expanded,
  onToggle,
  onNavigate,
}: SidebarSectionProps): JSX.Element {
  const containsActive = group.items.some((i) => i.view === activeView);
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150",
          containsActive ? "text-ink-secondary" : "text-ink-muted hover:text-ink-secondary"
        )}
      >
        {group.label}
        <ChevronDown
          size={12}
          aria-hidden
          className={cn("transition-transform duration-150", expanded ? "" : "-rotate-90")}
        />
      </button>
      {expanded && (
        <div className="mt-0.5 flex flex-col gap-px" role="list">
          {group.items.map((item) => (
            <SidebarItem
              key={item.view}
              item={item}
              active={item.view === activeView}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface WorkspaceSwitcherProps {
  children: ReactNode;
}

/** Bordered container styling the project selector like a workspace card. */
export function WorkspaceSwitcher({ children }: WorkspaceSwitcherProps): JSX.Element {
  return (
    <div className="px-3 pb-2">
      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Workspace
      </div>
      <div className="[&_select]:h-9 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-line [&_select]:bg-surface-1 [&_select]:bg-none [&_select]:px-2.5 [&_select]:text-[13px] [&_select]:text-ink [&_select]:shadow-none [&_select]:backdrop-blur-none">
        {children}
      </div>
    </div>
  );
}

interface SidebarProps {
  width?: number;
  groups?: NavGroup[];
  activeView: MainView;
  onNavigate: (view: MainView) => void;
  onOpenSearch: () => void;
  workspaceSwitcher: ReactNode;
  footer?: ReactNode;
  onHide?: () => void;
}

export function Sidebar({
  width = SIDEBAR_V2_WIDTH,
  groups,
  activeView,
  onNavigate,
  onOpenSearch,
  workspaceSwitcher,
  footer,
  onHide,
}: SidebarProps): JSX.Element {
  const navGroups = groups ?? NAV_GROUPS;
  const activeGroupId = (navGroups.find((g) => g.items.some((i) => i.view === activeView)) ?? navGroups[0]).id;
  const [expandedIds, setExpandedIds] = useState<string[]>(() => [
    navGroups[0].id,
    activeGroupId,
  ]);

  // Keep the group owning the active view expanded as navigation happens
  const effectiveExpanded = expandedIds.includes(activeGroupId)
    ? expandedIds
    : [...expandedIds, activeGroupId];

  return (
    <nav
      aria-label="Primary"
      style={{ width }}
      className="flex h-full shrink-0 flex-col border-r border-line bg-rail"
    >
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-3 text-[13px] font-bold text-ink">
          MC
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-ink">
          Mission Control
        </span>
        {onHide ? (
          <button
            type="button"
            onClick={onHide}
            className="rounded p-1 text-ink-muted hover:text-ink"
            title="Hide sidebar"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface-1 px-2.5 text-[13px] text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink-secondary"
        >
          <Search size={14} aria-hidden />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="flex items-center gap-0.5 rounded border border-line bg-surface-2 px-1 py-0.5 text-[10px] text-ink-muted">
            <Command size={9} aria-hidden />K
          </kbd>
        </button>
      </div>

      <WorkspaceSwitcher>{workspaceSwitcher}</WorkspaceSwitcher>

      <div className="flex-1 overflow-y-auto px-3 py-1">
        {navGroups.map((group) => (
          <SidebarSection
            key={group.id}
            group={group}
            activeView={activeView}
            expanded={effectiveExpanded.includes(group.id)}
            onToggle={() =>
              setExpandedIds((ids) =>
                ids.includes(group.id)
                  ? ids.filter((id) => id !== group.id)
                  : [...ids, group.id]
              )
            }
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {footer && <div className="border-t border-line px-3 py-3">{footer}</div>}
    </nav>
  );
}
