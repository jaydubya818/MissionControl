import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BellRing } from "lucide-react";
import type { MainView } from "../TopNav";
import { Sidebar } from "./Sidebar";
import { groupForView, itemForView, allNavViews } from "./navConfig";
import { EOS_NAV_GROUPS } from "./eosNavConfig";
import { useFlag } from "../hooks/useFlag";
import { Breadcrumbs } from "../components/factory/Breadcrumbs";
import { cn } from "../lib/utils";

const ROUTE_PREFIX = "/v2";

function viewFromPath(pathname: string, validViews: string[]): MainView | null {
  if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) return null;
  const candidate = pathname.slice(ROUTE_PREFIX.length + 1).split("/")[0];
  return validViews.includes(candidate) ? (candidate as MainView) : null;
}

interface AppShellV2Props {
  activeView: MainView;
  onNavigate: (view: MainView) => void;
  workspaceSwitcher: ReactNode;
  onOpenSearch: () => void;
  pendingApprovals: number;
  onOpenApprovals: () => void;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Software Factory shell (ui.shell.v2): fixed left navigation rail, slim
 * top bar with breadcrumbs, URL sync under /v2/<view>. Renders the same
 * lazy section content as the legacy shell — presentation only.
 */
export function AppShellV2({
  activeView,
  onNavigate,
  workspaceSwitcher,
  onOpenSearch,
  pendingApprovals,
  onOpenApprovals,
  headerActions,
  footer,
  children,
}: AppShellV2Props): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  // Guards the URL↔view sync against echo loops: when the URL drives a view
  // change, the follow-up view→URL effect must not navigate back.
  const syncingFromUrl = useRef(false);

  // URL → view (deep links, back/forward)
  useEffect(() => {
    const pathView = viewFromPath(location.pathname, validViews);
    if (pathView && pathView !== activeView) {
      syncingFromUrl.current = true;
      onNavigate(pathView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // view → URL (sidebar clicks, legacy in-app navigation)
  useEffect(() => {
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const expected = `${ROUTE_PREFIX}/${activeView}`;
    if (location.pathname !== expected) navigate(expected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const eosPreview = useFlag("eos.command-center-preview");
  const navGroups = eosPreview ? EOS_NAV_GROUPS : undefined;
  const activeGroups = navGroups ?? null;
  const validViews = activeGroups
    ? [...new Set([...activeGroups.flatMap((g) => g.items.map((i) => i.view as string)), ...allNavViews()])]
    : (allNavViews() as string[]);
  const group = activeGroups
    ? activeGroups.find((g) => g.items.some((i) => i.view === activeView)) ?? groupForView(activeView)
    : groupForView(activeView);
  const item = activeGroups
    ? activeGroups.flatMap((g) => g.items).find((i) => i.view === activeView) ?? itemForView(activeView)
    : itemForView(activeView);
  const crumbs = [
    ...(group ? [{ label: group.label }] : []),
    ...(item ? [{ label: item.label, current: true }] : []),
  ];

  return (
    <div className="shell-v2 flex h-screen overflow-hidden">
      <Sidebar
        groups={navGroups}
        activeView={activeView}
        onNavigate={onNavigate}
        onOpenSearch={onOpenSearch}
        workspaceSwitcher={workspaceSwitcher}
        footer={footer}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-app px-5">
          <Breadcrumbs items={crumbs} />
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onOpenApprovals}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors duration-150",
                pendingApprovals > 0
                  ? "border-line-strong bg-warn-soft text-warn"
                  : "border-line text-ink-muted hover:text-ink-secondary"
              )}
            >
              <BellRing size={13} aria-hidden />
              {pendingApprovals > 0
                ? `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"}`
                : "Approvals"}
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-app">{children}</main>
      </div>
    </div>
  );
}
