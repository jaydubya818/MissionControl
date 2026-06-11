import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Home,
  Crosshair,
  Bot,
  MessageSquare,
  FileText,
  Radio,
  BookOpen,
  Code2,
  ShieldCheck,
  LayoutGrid,
  Orbit,
  type LucideIcon,
} from "lucide-react";
import type { CommandSection } from "../TopNav";

interface CommandNavItem {
  id: CommandSection;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

interface CommandNavGroup {
  id: string;
  label: string;
  items: CommandNavItem[];
}

const NAV_GROUPS: CommandNavGroup[] = [
  {
    id: "mission",
    label: "Mission",
    items: [
      { id: "home", label: "Home", shortLabel: "Home", icon: Home },
      { id: "control", label: "Control", shortLabel: "Ctrl", icon: Orbit },
      { id: "ops", label: "Operations", shortLabel: "Ops", icon: Crosshair },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    items: [
      { id: "agents", label: "Agents", shortLabel: "Agents", icon: Bot },
      { id: "chat", label: "Chat", shortLabel: "Chat", icon: MessageSquare },
      { id: "code", label: "Code", shortLabel: "Code", icon: Code2 },
      { id: "quality", label: "Quality", shortLabel: "QC", icon: ShieldCheck },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { id: "content", label: "Content", shortLabel: "Content", icon: FileText },
      { id: "comms", label: "Comms", shortLabel: "Comms", icon: Radio },
      { id: "knowledge", label: "Knowledge", shortLabel: "KB", icon: BookOpen },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [{ id: "platform", label: "Platform", shortLabel: "Platform", icon: LayoutGrid }],
  },
];

interface CommandNavProps {
  activeSection: CommandSection;
  onSectionChange: (section: CommandSection) => void;
  className?: string;
}

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: CommandNavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.label}
      className={cn(
        "relative flex h-10 min-w-fit flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2.5",
        "text-[11px] font-semibold uppercase tracking-[0.14em]",
        "transition-all duration-150 active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        isActive
          ? "text-cyan-50"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {isActive && (
        <motion.div
          layoutId="command-nav-bg"
          className="absolute inset-0 rounded-lg border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(103,232,249,0.18),rgba(45,212,191,0.06)_55%,rgba(11,17,32,0.05))] shadow-[var(--glow-cyan)]"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}

      <Icon
        className={cn(
          "relative h-3.5 w-3.5 shrink-0 transition-transform duration-150",
          isActive && "drop-shadow-[0_0_14px_rgba(103,232,249,0.55)]"
        )}
        strokeWidth={isActive ? 2 : 1.7}
      />
      <span className="relative hidden md:inline">{item.label}</span>
      <span className="relative hidden sm:inline md:hidden">{item.shortLabel}</span>

      {isActive && (
        <motion.div
          layoutId="command-nav-active"
          className="absolute inset-x-3 bottom-1 h-[2.5px] rounded-full bg-cyan-300"
          style={{ boxShadow: "var(--glow-cyan)" }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}

export function CommandNav({
  activeSection,
  onSectionChange,
  className,
}: CommandNavProps) {
  return (
    <nav
      className={cn(
        "relative flex items-center gap-3 border-b border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_97%,transparent),color-mix(in_srgb,var(--background)_90%,transparent))] px-3 py-2 backdrop-blur-[var(--blur-panel)]",
        className
      )}
      aria-label="Command center navigation"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(103,232,249,0.04),transparent_18%,transparent_82%,rgba(45,212,191,0.04))]" />
      <div className="relative flex min-w-0 flex-1 items-center overflow-x-auto">
        <div className="hidden shrink-0 items-center gap-3 rounded-xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_98%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] px-3 py-2 xl:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-400/16 bg-cyan-400/6 text-cyan-200 shadow-[var(--glow-cyan)]">
            <Crosshair className="h-4 w-4" />
          </div>
          <div className="leading-none">
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-muted-foreground/50">
              Command Grid
            </div>
            <div className="font-[family:var(--font-display)] text-sm font-semibold tracking-[0.18em] text-foreground">
              SellerFi Ops
            </div>
          </div>
        </div>

        <div className="ml-3 flex min-w-0 flex-1 items-center rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_98%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div
              key={group.id}
              role="group"
              aria-label={group.label}
              className="flex min-w-fit flex-1 items-center"
              style={{ flexGrow: group.items.length }}
            >
              {groupIndex > 0 && (
                <span
                  aria-hidden
                  className="mx-1 h-5 w-px shrink-0 bg-[var(--panel-line-strong)]"
                />
              )}
              {group.items.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeSection === item.id}
                  onClick={() => onSectionChange(item.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
