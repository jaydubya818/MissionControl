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
  type LucideIcon,
} from "lucide-react";
import type { CommandSection } from "../TopNav";

interface CommandNavItem {
  id: CommandSection;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const navItems: CommandNavItem[] = [
  { id: "home", label: "Home", shortLabel: "Home", icon: Home },
  { id: "ops", label: "Operations", shortLabel: "Ops", icon: Crosshair },
  { id: "agents", label: "Agents", shortLabel: "Agents", icon: Bot },
  { id: "chat", label: "Chat", shortLabel: "Chat", icon: MessageSquare },
  { id: "content", label: "Content", shortLabel: "Content", icon: FileText },
  { id: "comms", label: "Comms", shortLabel: "Comms", icon: Radio },
  { id: "knowledge", label: "Knowledge", shortLabel: "KB", icon: BookOpen },
  { id: "code", label: "Code", shortLabel: "Code", icon: Code2 },
  { id: "quality", label: "Quality", shortLabel: "QC", icon: ShieldCheck },
];

interface CommandNavProps {
  activeSection: CommandSection;
  onSectionChange: (section: CommandSection) => void;
  className?: string;
}

export function CommandNav({
  activeSection,
  onSectionChange,
  className,
}: CommandNavProps) {
  return (
    <nav
      className={cn(
        "relative flex items-center h-11 px-2 border-b border-border bg-background",
        className
      )}
      aria-label="Command center navigation"
    >
      <div className="flex items-center flex-1 overflow-x-auto">
        {/* Brand mark */}
        <div className="hidden lg:flex items-center gap-2 pl-3 pr-4 mr-2 border-r border-border/70 shrink-0">
          <div className="h-5 w-5 rounded-md bg-primary/20 flex items-center justify-center">
            <Crosshair className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
            MC
          </span>
        </div>

        {/* Nav items */}
        <div className="flex flex-1 min-w-0">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "relative flex-1 flex items-center justify-center gap-1.5 h-11 min-w-[52px] px-2",
                  "text-[11px] font-semibold tracking-wide uppercase",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-md",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {/* Full label on md+, short on sm, hidden on xs (icon only) */}
                <span className="hidden md:inline">{item.label}</span>
                <span className="hidden sm:inline md:hidden">{item.shortLabel}</span>
                {isActive && (
                  <motion.div
                    layoutId="command-nav-active"
                    className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-primary"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
