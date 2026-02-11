import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  BarChart3,
  Settings,
  Keyboard,
  Activity,
  DollarSign,
  TrendingDown,
  HeartPulse,
  Monitor,
  LayoutDashboard,
  AlertTriangle,
  User,
  Moon,
  Sun,
} from "lucide-react";
import { useState, useEffect } from "react";

interface AppTopBarProps {
  projectSwitcher: React.ReactNode;
  searchBar: React.ReactNode;
  activeCount: number;
  taskCount: number;
  timeStr: string;
  dateStr: string;
  onNewTask: () => void;
  onOpenControls: () => void;
  onOpenCommandPalette: () => void;
  onOpenCostAnalytics: () => void;
  onOpenBudgetBurnDown: () => void;
  onOpenAdvancedAnalytics: () => void;
  onOpenHealthDashboard: () => void;
  onOpenMonitoringDashboard: () => void;
  onOpenDashboardOverview: () => void;
  onOpenActivityFeed: () => void;
  onOpenKeyboardHelp: () => void;
}

export function AppTopBar({
  projectSwitcher,
  searchBar,
  activeCount,
  taskCount,
  timeStr,
  dateStr,
  onNewTask,
  onOpenControls,
  onOpenCommandPalette,
  onOpenCostAnalytics,
  onOpenBudgetBurnDown,
  onOpenAdvancedAnalytics,
  onOpenHealthDashboard,
  onOpenMonitoringDashboard,
  onOpenDashboardOverview,
  onOpenActivityFeed,
  onOpenKeyboardHelp,
}: AppTopBarProps) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem("mc.theme") || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.add("light");
    } else {
      root.removeAttribute("data-theme");
      root.classList.remove("light");
    }
    window.localStorage.setItem("mc.theme", theme);
  }, [theme]);

  return (
    <header className="flex h-12 items-center gap-3 border-b border-border bg-background px-4">
      {/* Left: project + search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {projectSwitcher}
        <div className="hidden sm:block flex-1 max-w-[260px]">
          {searchBar}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden h-8 w-8 text-muted-foreground"
          onClick={onOpenCommandPalette}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Center: metrics */}
      <div className="hidden md:flex items-center gap-4 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {activeCount} Active
        </span>
        <span>{taskCount} Tasks</span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden lg:inline">Insights</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onOpenCostAnalytics}>
              <DollarSign className="h-4 w-4 mr-2" />Cost Analytics
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenBudgetBurnDown}>
              <TrendingDown className="h-4 w-4 mr-2" />Budget Burn-Down
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAdvancedAnalytics}>
              <BarChart3 className="h-4 w-4 mr-2" />Advanced Analytics
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenHealthDashboard}>
              <HeartPulse className="h-4 w-4 mr-2" />Health Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenMonitoringDashboard}>
              <Monitor className="h-4 w-4 mr-2" />Monitoring
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenDashboardOverview}>
              <LayoutDashboard className="h-4 w-4 mr-2" />Overview Snapshot
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenActivityFeed}>
              <Activity className="h-4 w-4 mr-2" />Activity Timeline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenKeyboardHelp}>
              <Keyboard className="h-4 w-4 mr-2" />Shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-orange-400 hover:text-orange-300"
          onClick={onOpenControls}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          <span className="hidden lg:inline">Controls</span>
        </Button>

        <Button size="sm" className="h-8 text-xs" onClick={onNewTask}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Task
        </Button>

        {/* Time + Status */}
        <span className="hidden xl:inline text-[11px] text-muted-foreground whitespace-nowrap ml-1">
          {timeStr} {dateStr}
        </span>
        <span className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Online
        </span>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User menu placeholder */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled>
              <Settings className="h-4 w-4 mr-2" />Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenKeyboardHelp}>
              <Keyboard className="h-4 w-4 mr-2" />Shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
