import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  isRouteVisible,
  routeBadge,
  type RouteAccessContext,
} from "./routeCapabilities";
import { useNavGroupsWithCounts } from "./useNavGroupsWithCounts";
import { useFlag } from "../hooks/useFlag";
import { Breadcrumbs } from "../components/factory/Breadcrumbs";
import { useHarnessAnimation } from "../components/schematic/useHarnessAnimation";
import { cn } from "../lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  canonicalMissionLocation,
  isCanonicalMissionDetail,
  missionIdFromLocation,
} from "../eos/missionRoutes";

const ROUTE_PREFIX = "/v2";
const COMPACT_SHELL_QUERY = "(max-width: 899px)";

export function viewFromPath(
  pathname: string,
  validViews: string[],
  search = ""
): MainView | null {
  if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) return null;
  if (
    missionIdFromLocation(pathname, search) &&
    validViews.includes("mission-detail")
  ) {
    return "mission-detail";
  }
  const candidate = pathname.slice(ROUTE_PREFIX.length + 1).split("/")[0];
  return validViews.includes(candidate) ? (candidate as MainView) : null;
}

export function shouldDeferRouteWrite(
  pathname: string,
  validViews: string[],
  activeView: MainView,
  search = ""
): boolean {
  const pathView = viewFromPath(pathname, validViews, search);
  return pathView !== null && pathView !== activeView;
}

export function initialViewFromLocation(
  pathname: string,
  validViews: string[],
  persistedView: MainView | null,
  search = ""
): MainView {
  return viewFromPath(pathname, validViews, search) ?? persistedView ?? "home";
}

interface AppShellV2Props {
  activeView: MainView;
  onNavigate: (view: MainView) => void;
  workspaceSwitcher: ReactNode;
  companySwitcher?: ReactNode;
  onOpenSearch: () => void;
  pendingApprovals: number;
  onOpenApprovals: () => void;
  canOpenApprovals?: boolean;
  headerActions?: ReactNode;
  footer?: ReactNode;
  projectId?: Id<"projects"> | null;
  access?: RouteAccessContext;
  onDemoPersonaChange?: (persona?: "EXECUTIVE" | "ARCHITECT" | "BUILDER" | "ADMIN") => void;
  children: ReactNode;
}

/**
 * Software Factory shell: resizable nav | main | chat dock (waku-agent 3-column).
 */
export function AppShellV2({
  activeView,
  onNavigate,
  workspaceSwitcher,
  companySwitcher,
  onOpenSearch,
  pendingApprovals,
  onOpenApprovals,
  canOpenApprovals = true,
  headerActions,
  footer,
  projectId,
  access,
  onDemoPersonaChange,
  children,
}: AppShellV2Props): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const syncingFromUrl = useRef(false);
  const [compactShell, setCompactShell] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(COMPACT_SHELL_QUERY).matches
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDockOpen, setMobileDockOpen] = useState(false);

  const columns = useResizableColumns();
  const { statusLabel } = useHarnessAnimation(projectId ?? undefined);

  const eosPreview = useFlag("eos.command-center-preview");
  const showControlStubs = useFlag("ui.control.stubs");
  const showPreviewRoutes = useFlag("ui.navigation.previews");
  const showDemoRoutes = useFlag("ui.navigation.demo-routes");
  const baseNavGroups = eosPreview ? EOS_NAV_GROUPS : NAV_GROUPS;
  const filteredGroups = filterNavGroups(baseNavGroups, {
    showControlStubs,
    enforceRouteCapabilities: eosPreview,
    showPreviewRoutes,
    showDemoRoutes,
    access,
  });
  const navGroups = useNavGroupsWithCounts(filteredGroups, projectId);
  const validViews = [
    ...new Set([
      ...baseNavGroups.flatMap((g) => g.items.map((i) => i.view as string)),
      ...allNavViews(),
      "automation-runs",
      "mission-detail",
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
  const activeRouteBadge = eosPreview ? routeBadge(activeView) : undefined;

  useEffect(() => {
    const normalizedMission = canonicalMissionLocation(
      location.pathname,
      location.search
    );
    if (normalizedMission) {
      navigate(normalizedMission, { replace: true });
      return;
    }
    const pathView = viewFromPath(location.pathname, validViews, location.search);
    if (pathView && pathView !== activeView) {
      syncingFromUrl.current = true;
      onNavigate(pathView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, validViews.join(",")]);

  useEffect(() => {
    // Let the URL → state effect settle before writing state back to the URL.
    // Without this guard a persisted view can replace a direct deep link on
    // initial render (for example /v2/agents becoming /v2/command-center).
    if (canonicalMissionLocation(location.pathname, location.search)) {
      return;
    }
    if (shouldDeferRouteWrite(location.pathname, validViews, activeView, location.search)) {
      return;
    }
    if (
      eosPreview &&
      !isRouteVisible(activeView, { showPreviewRoutes, showDemoRoutes })
    ) {
      onNavigate("command-center");
      return;
    }
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const isAutomationDetail = activeView === "automations"
      && location.pathname.startsWith(`${ROUTE_PREFIX}/automations/`);
    const isAutomationRunDetail = activeView === "automation-runs"
      && location.pathname.startsWith(`${ROUTE_PREFIX}/automation-runs/`);
    if (isAutomationDetail || isAutomationRunDetail) return;
    const expected =
      activeView === "mission-detail" && isCanonicalMissionDetail(location.pathname)
        ? location.pathname
        : `${ROUTE_PREFIX}/${activeView}`;
    if (location.pathname !== expected) {
      navigate({ pathname: expected, search: location.search }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    eosPreview,
    location.pathname,
    location.search,
    showDemoRoutes,
    showPreviewRoutes,
  ]);

  useEffect(() => {
    document.body.classList.toggle("shell-resizing", columns.resizing);
    return () => document.body.classList.remove("shell-resizing");
  }, [columns.resizing]);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_SHELL_QUERY);
    const sync = (event: MediaQueryListEvent | MediaQueryList) => {
      setCompactShell(event.matches);
      if (!event.matches) {
        setMobileNavOpen(false);
        setMobileDockOpen(false);
      }
    };

    sync(media);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const navigateFromSidebar = (view: MainView) => {
    onNavigate(view);
    const expected = `${ROUTE_PREFIX}/${view}`;
    if (location.pathname !== expected) {
      navigate({ pathname: expected, search: location.search });
    }
    setMobileNavOpen(false);
  };

  const archStatus = statusLabel ? (
    <>
      <span className="schematic-live-dot" aria-hidden />
      {statusLabel}
    </>
  ) : null;

  return (
    <div className="shell-v2 flex h-screen overflow-hidden">
      {compactShell ? (
        mobileNavOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/65"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative z-10 h-full w-[min(86vw,320px)] shadow-2xl">
              <Sidebar
                width={Math.min(columns.navWidth, 320)}
                groups={navGroups}
                activeView={activeView}
                onNavigate={navigateFromSidebar}
                onOpenSearch={() => {
                  setMobileNavOpen(false);
                  onOpenSearch();
                }}
                workspaceSwitcher={workspaceSwitcher}
                companySwitcher={companySwitcher}
                footer={footer}
                onHide={() => setMobileNavOpen(false)}
              />
            </div>
          </div>
        ) : null
      ) : !columns.navHidden ? (
        <>
          <Sidebar
            width={columns.navWidth}
            groups={navGroups}
            activeView={activeView}
            onNavigate={navigateFromSidebar}
            onOpenSearch={onOpenSearch}
            workspaceSwitcher={workspaceSwitcher}
            companySwitcher={companySwitcher}
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
          aria-label="Show sidebar"
        >
          <Menu size={16} aria-hidden />
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-app px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {compactShell ? (
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-secondary hover:text-ink"
                aria-label="Open navigation"
                aria-expanded={mobileNavOpen}
              >
                <Menu size={16} aria-hidden />
              </button>
            ) : null}
            <div className="min-w-0 overflow-hidden">
              <Breadcrumbs items={crumbs} />
            </div>
            {activeRouteBadge ? (
              <span className="shrink-0 rounded border border-line bg-surface-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                {activeRouteBadge}
              </span>
            ) : null}
            {access?.persona ? (
              <span className="hidden shrink-0 rounded border border-line bg-surface-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-secondary sm:inline-flex">
                {access.persona}
              </span>
            ) : null}
            {access?.identityMode === "DEMO" ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-warning">
                  Local demo · non-production
                </span>
                {onDemoPersonaChange ? (
                  <select
                    aria-label="Preview persona"
                    value={access.demoPreview ? access.persona ?? "" : ""}
                    onChange={(event) => onDemoPersonaChange(
                      event.target.value
                        ? event.target.value as "EXECUTIVE" | "ARCHITECT" | "BUILDER" | "ADMIN"
                        : undefined
                    )}
                    className="hidden h-7 rounded border border-line bg-surface-1 px-2 text-[10px] font-medium text-ink-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
                  >
                    <option value="">Normal demo (Admin)</option>
                    <option value="EXECUTIVE">Preview Executive</option>
                    <option value="ARCHITECT">Preview Architect</option>
                    <option value="BUILDER">Preview Builder</option>
                    <option value="ADMIN">Preview Admin</option>
                  </select>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            {compactShell ? (
              <button
                type="button"
                onClick={() => setMobileDockOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-secondary hover:text-ink"
                aria-label="Open chat"
                aria-expanded={mobileDockOpen}
              >
                <MessageSquare size={14} aria-hidden />
              </button>
            ) : null}
            {canOpenApprovals ? <button
              type="button"
              onClick={onOpenApprovals}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors duration-150",
                pendingApprovals > 0
                  ? "border-line-strong bg-warn-soft text-warn"
                  : "border-line text-ink-muted hover:text-ink-secondary"
              )}
              aria-label={
                pendingApprovals > 0
                  ? `${pendingApprovals} pending approval${pendingApprovals === 1 ? "" : "s"}`
                  : "Open approvals"
              }
            >
              <BellRing size={13} aria-hidden />
              {compactShell
                ? pendingApprovals || null
                : pendingApprovals > 0
                  ? `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"}`
                  : "Approvals"}
            </button> : null}
          </div>
        </header>
        <main className="flex min-h-0 flex-1 overflow-hidden bg-app">
          <div className="shell-main factory-page min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </div>
          {!compactShell && !columns.dockClosed ? (
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
          ) : !compactShell ? (
            <button
              type="button"
              onClick={() => columns.setDockClosed(false)}
              className="fixed right-3 top-14 z-30 flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[12px] text-ink-secondary shadow-sm hover:text-ink"
              title="Open chat"
              aria-label="Open chat"
            >
              <MessageSquare size={14} aria-hidden />
              Chat
            </button>
          ) : null}
        </main>
      </div>

      {compactShell && mobileDockOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close chat"
            className="absolute inset-0 bg-black/65"
            onClick={() => setMobileDockOpen(false)}
          />
          <div className="relative z-10 h-full w-full max-w-[440px] shadow-2xl">
            <ChatDock
              width="100%"
              onClose={() => setMobileDockOpen(false)}
              projectId={projectId}
              archStatus={archStatus}
              onNavigate={(view) => {
                setMobileDockOpen(false);
                onNavigate(view);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
