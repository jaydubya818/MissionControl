import { cn } from "@/lib/utils";

export interface SchematicSubTab {
  id: string;
  label: string;
  count?: number;
}

export interface SchematicSubTabsProps {
  tabs: SchematicSubTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/** In-page sub-tabs (waku #view/sub pattern). */
export function SchematicSubTabs({
  tabs,
  active,
  onChange,
  className,
}: SchematicSubTabsProps): JSX.Element {
  return (
    <div className={cn("schematic-subtabs", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={cn("schematic-subtab", tab.id === active && "schematic-subtab-active")}
        >
          {tab.label}
          {tab.count != null ? (
            <span className="schematic-subtab-count">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
