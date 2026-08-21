import type { MainView } from "../TopNav";
import type { NavGroup } from "./navConfig";
import { isRouteVisible, routeBadge } from "./routeCapabilities";

/** Control plane views that are preview-only until Convex-backed. */
const STUB_CONTROL_VIEWS = new Set<MainView>(["control-portfolio", "control-fleet"]);

export interface NavFilterOptions {
  /** When false (default), hide preview stub routes from the sidebar. */
  showControlStubs?: boolean;
  /** Apply the EOS route scope/maturity product contract. */
  enforceRouteCapabilities?: boolean;
  /** Show routes explicitly classified as preview. */
  showPreviewRoutes?: boolean;
  /** Show routes explicitly classified as demo-only. */
  showDemoRoutes?: boolean;
}

/** Apply runtime nav visibility rules without mutating the canonical config. */
export function filterNavGroups(
  groups: NavGroup[],
  options: NavFilterOptions = {}
): NavGroup[] {
  const {
    showControlStubs = false,
    enforceRouteCapabilities = false,
    showPreviewRoutes = false,
    showDemoRoutes = false,
  } = options;
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => {
          if (!showControlStubs && STUB_CONTROL_VIEWS.has(item.view)) {
            return false;
          }
          if (
            enforceRouteCapabilities &&
            !isRouteVisible(item.view, { showPreviewRoutes, showDemoRoutes })
          ) {
            return false;
          }
          return true;
        })
        .map((item) => ({
          ...item,
          // Maturity labelling is unconditional. Enforcement decides whether a
          // Preview/Demo route is *hidden*; it must not decide whether the
          // operator can *tell* a demo surface from a governed Live one.
          badge:
            routeBadge(item.view, {
              labelUndeclaredAsPreview: !enforceRouteCapabilities,
            }) ?? item.badge,
        })),
    }))
    .filter((group) => group.items.length > 0);
}
