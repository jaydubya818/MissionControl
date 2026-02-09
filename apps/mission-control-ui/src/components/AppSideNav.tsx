import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  ListTodo,
  GitBranch,
  Bot,
  FolderKanban,
  MessageSquare,
  Users,
  Building2,
  Calendar,
  Brain,
  Camera,
  FileText,
  UserCircle,
  Search,
  Fingerprint,
  Radio,
  Video,
  Mic,
  ChevronLeft,
  ChevronRight,
  Shield,
  Bell,
  type LucideIcon,
} from "lucide-react";
import type { MainView } from "../TopNav";

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NavItem {
  id: MainView;
  label: string;
  icon: LucideIcon;
}

const navGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { id: "tasks", label: "Tasks", icon: ListTodo },
      { id: "dag", label: "DAG", icon: GitBranch },
      { id: "calendar", label: "Calendar", icon: Calendar },
    ],
  },
  {
    label: "Agents",
    items: [
      { id: "agents", label: "Registry", icon: Bot },
      { id: "identity", label: "Identities", icon: Fingerprint },
      { id: "memory", label: "Memory", icon: Brain },
    ],
  },
  {
    label: "Projects",
    items: [
      { id: "projects", label: "Projects", icon: FolderKanban },
      { id: "captures", label: "Captures", icon: Camera },
      { id: "docs", label: "Docs", icon: FileText },
    ],
  },
  {
    label: "Comms",
    items: [
      { id: "chat", label: "Chat", icon: MessageSquare },
      { id: "council", label: "Council", icon: Users },
      { id: "telegraph", label: "Telegraph", icon: Radio },
      { id: "meetings", label: "Meetings", icon: Video },
      { id: "voice", label: "Voice", icon: Mic },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "people", label: "People", icon: UserCircle },
      { id: "org", label: "Org Chart", icon: Building2 },
      { id: "office", label: "Office", icon: LayoutDashboard },
      { id: "search", label: "Search", icon: Search },
    ],
  },
];

interface AppSideNavProps {
  currentView: MainView;
  onViewChange: (view: MainView) => void;
  onOpenApprovals?: () => void;
  onOpenNotifications?: () => void;
  pendingApprovals?: number;
}

export function AppSideNav({
  currentView,
  onViewChange,
  onOpenApprovals,
  onOpenNotifications,
  pendingApprovals = 0,
}: AppSideNavProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mc.sidenav_collapsed") === "1";
  });

  useEffect(() => {
    window.localStorage.setItem("mc.sidenav_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-200",
          collapsed ? "w-[52px]" : "w-[220px]"
        )}
      >
        {/* Logo / Brand */}
        <div className={cn(
          "flex h-12 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between"
        )}>
          {!collapsed && (
            <span className="text-sm font-bold tracking-wide text-sidebar-foreground">
              Mission Control
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Quick actions */}
        {!collapsed && (
          <div className="flex gap-1 px-2 py-2 border-b border-sidebar-border">
            {onOpenNotifications && (
              <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs text-muted-foreground" onClick={onOpenNotifications}>
                <Bell className="h-3.5 w-3.5 mr-1" />
                Alerts
              </Button>
            )}
            {onOpenApprovals && (
              <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs text-muted-foreground relative" onClick={onOpenApprovals}>
                <Shield className="h-3.5 w-3.5 mr-1" />
                Approvals
                {pendingApprovals > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                    {pendingApprovals}
                  </span>
                )}
              </Button>
            )}
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 py-2 border-b border-sidebar-border">
            {onOpenNotifications && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onOpenNotifications}>
                    <Bell className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Alerts</TooltipContent>
              </Tooltip>
            )}
            {onOpenApprovals && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground relative" onClick={onOpenApprovals}>
                    <Shield className="h-4 w-4" />
                    {pendingApprovals > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                        {pendingApprovals}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Approvals{pendingApprovals > 0 ? ` (${pendingApprovals})` : ""}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Navigation groups */}
        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-1 p-2" aria-label="Main navigation">
            {navGroups.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && <Separator className="my-2" />}
                {!collapsed && (
                  <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                )}
                {group.items.map((item) => {
                  const isActive = currentView === item.id;
                  const Icon = item.icon;

                  if (collapsed) {
                    return (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            size="icon"
                            className={cn(
                              "h-8 w-8 my-0.5",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => onViewChange(item.id)}
                            aria-current={isActive ? "page" : undefined}
                          >
                            <Icon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Button
                      key={item.id}
                      variant={isActive ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start h-8 px-2 text-sm my-0.5",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => onViewChange(item.id)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 mr-2 shrink-0" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
