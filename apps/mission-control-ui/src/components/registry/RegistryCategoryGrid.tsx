import type { RegistryCategoryDef } from "@/lib/registryCategories";
import { cn } from "@/lib/utils";

export interface RegistryCategoryGridProps {
  categories: RegistryCategoryDef[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Tessl-style 2-row category card grid. */
export function RegistryCategoryGrid({
  categories,
  activeId,
  onSelect,
}: RegistryCategoryGridProps): JSX.Element {
  return (
    <div className="registry-category-grid">
      {categories.map((category) => {
        const Icon = category.icon;
        const active = activeId === category.id;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            aria-pressed={active}
            className={cn("registry-category-card", active && "registry-category-card-active")}
          >
            <span className="registry-category-icon">
              <Icon size={18} strokeWidth={1.6} aria-hidden />
            </span>
            <span className="registry-category-label">{category.label}</span>
            <span className="registry-category-desc">{category.description}</span>
          </button>
        );
      })}
    </div>
  );
}
