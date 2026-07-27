import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BellRing, Menu, MessageSquare } from "lucide-react";
import type { MainView } from "../TopNav";
import { Sidebar } from "./Sidebar";
import { ChatDock } from "./ChatDock";
import { ResizerHandle } from "./ResizerHandle";
import { useResizableColumns } from "./useResizableColumns";
import { groupForView, itemForView, allNavViews, NAV_GROUPS } from "./navConfig";
import { EOS_NAV_GROUPS } from "./eosNavConfig";
import { filterNavGroups } from "./navFilter";
import { useNavGroupsWithCounts } from "./useNavGroupsWithCounts";
import { useFlag } from "../hooks/useFlag";
import { Breadcrumbs } from "../components/factory/Breadcrumbs";
import { useHarnessAnimation } from "../components/schematic/useHarnessAnimation";
import { cn } from "../lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";

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
  projectId?: Id<"projects"> | null;
  children: ReactNode;
}

/**
 * Software Factory shell: resizable nav | main | chat dock (waku-agent 3-column).
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
  projectId,
  children,
}: AppShellV2Props): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const syncingFromUrl = useRef(false);

  const columns = useResizableColumns();
  const { statusLabel } = useHarnessAnimation(projectId ?? undefined);

  const eosPreview = useFlag("eos.command-center-preview");
  const showControlStubs = useFlag("ui.control.stubs");
  const baseNavGroups = eosPreview ? EOS_NAV_GROUPS : NAV_GROUPS;
  const filteredGroups = filterNavGroups(baseNavGroups, { showControlStubs });
  const navGroups = useNavGroupsWithCounts(filteredGroups);
  const validViews = [
    ...new Set([
      ...baseNavGroups.flatMap((g) => g.items.map((i) => i.view as string)),
      ...allNavViews(),
    ]),
  ];
  const group =
    navGroups.find((g) => g.items.some((i) => i.view === activeView)) ??
    groupForView(activeView);
  const item =
    navGroups.flatMap((g) => g.items).find((i) => i.view === activeView) ??
    itemForView(activeView);
  const crumbs = [
    ...(group ? [{ label: group.label }] : []),
    ...(item ? [{ label: item.label, current: true }] : []),
  ];

  useEffect(() => {
    const pathView = viewFromPath(location.pathname, validViews);
    if (pathView && pathView !== activeView) {
      syncingFromUrl.current = true;
      onNavigate(pathView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, validViews.join(",")]);

  useEffect(() => {
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const expected = `${ROUTE_PREFIX}/${activeView}`;
    if (location.pathname !== expected) navigate(expected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  useEffect(() => {
    document.body.classList.toggle("shell-resizing", columns.resizing);
    return () => document.body.classList.remove("shell-resizing");
  }, [columns.resizing]);

  const archStatus = statusLabel ? (
    <>
      <span className="schematic-live-dot" aria-hidden />
      {statusLabel}
    </>
  ) : null;

  return (
    <div className="shell-v2 flex h-screen overflow-hidden">
      {!columns.navHidden ? (
        <>
          <Sidebar
            width={columns.navWidth}
            groups={navGroups}
            activeView={activeView}
            onNavigate={onNavigate}
            onOpenSearch={onOpenSearch}
            workspaceSwitcher={workspaceSwitcher}
            footer={footer}
            onHide={() => columns.setNavHidden(true)}
          />
          <ResizerHandle
            onResize={columns.onNavResize}
            onBegin={columns.beginResize}
            onEnd={columns.endResize}
            title="Drag to resize sidebar"
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => columns.setNavHidden(false)}
          className="fixed left-3 top-3 z-30 flex h-[30px] w-[34px] items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-secondary shadow-sm hover:text-ink"
          title="Show sidebar"
        >
          <Menu size={16} aria-hidden />
        </button>
      )}

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
        <main className="flex min-h-0 flex-1 overflow-hidden bg-app">
          <div className="shell-main factory-page min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </div>
          {!columns.dockClosed ? (
            <>
              <ResizerHandle
                onResize={columns.onDockResize}
                onBegin={columns.beginResize}
                onEnd={columns.endResize}
                title="Drag to resize chat"
              />
              <ChatDock
                width={columns.dockWidth}
                onClose={() => columns.setDockClosed(true)}
                projectId={projectId}
                archStatus={archStatus}
                onNavigate={onNavigate}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => columns.setDockClosed(false)}
              className="fixed right-3 top-14 z-30 flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[12px] text-ink-secondary shadow-sm hover:text-ink"
              title="Open chat"
            >
              <MessageSquare size={14} aria-hidden />
              Chat
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
