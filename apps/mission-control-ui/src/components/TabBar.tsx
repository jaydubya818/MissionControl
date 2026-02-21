import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (tabs.length === 0) return;

    if (event.key === "Home") {
      onTabChange(tabs[0].id);
      return;
    }
    if (event.key === "End") {
      onTabChange(tabs[tabs.length - 1].id);
      return;
    }

    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    onTabChange(tabs[nextIndex].id);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-4 py-2",
        "border-b border-border/70 bg-background",
        className
      )}
      role="tablist"
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "relative rounded-md px-3 py-1.5",
              "text-xs font-semibold tracking-wide",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="tab-bar-pill"
                className="absolute inset-0 rounded-md bg-muted border border-border"
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "min-w-[18px] h-[18px] flex items-center justify-center",
                    "rounded-full text-[10px] font-bold",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
