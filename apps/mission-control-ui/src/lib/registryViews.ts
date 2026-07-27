import type { MainView } from "../TopNav";

export type RegistryTab =
  | "catalog"
  | "lifecycle"
  | "evaluate"
  | "inventory"
  | "installations"
  | "evals";

export const REGISTRY_TAB_VIEWS: Record<RegistryTab, MainView> = {
  catalog: "skills",
  lifecycle: "registry-lifecycle",
  evaluate: "registry-evaluate",
  inventory: "registry-inventory",
  installations: "registry-installations",
  evals: "registry-runs",
};

export const REGISTRY_VIEWS: MainView[] = Object.values(REGISTRY_TAB_VIEWS);

export function isRegistryView(view: MainView): boolean {
  return REGISTRY_VIEWS.includes(view);
}

export function registryTabFromView(view: MainView): RegistryTab | null {
  switch (view) {
    case "skills":
      return "catalog";
    case "registry-lifecycle":
      return "lifecycle";
    case "registry-evaluate":
      return "evaluate";
    case "registry-inventory":
      return "inventory";
    case "registry-installations":
      return "installations";
    case "registry-runs":
      return "evals";
    default:
      return null;
  }
}

export function registryViewFromTab(tab: RegistryTab): MainView {
  return REGISTRY_TAB_VIEWS[tab];
}
