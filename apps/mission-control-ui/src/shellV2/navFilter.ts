import type { MainView } from "../TopNav";
import type { NavGroup } from "./navConfig";

/** Control plane views that are preview-only until Convex-backed. */
const STUB_CONTROL_VIEWS = new Set<MainView>(["control-portfolio", "control-fleet"]);

export interface NavFilterOptions {
  /** When false (default), hide preview stub routes from the sidebar. */
  showControlStubs?: boolean;
}

/** Apply runtime nav visibility rules without mutating the canonical config. */
export function filterNavGroups(
  groups: NavGroup[],
  options: NavFilterOptions = {}
): NavGroup[] {
  const { showControlStubs = false } = options;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!showControlStubs && STUB_CONTROL_VIEWS.has(item.view)) {
          return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
