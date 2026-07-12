/**
 * Cross-view selection + navigation bus for the Skills Marketplace.
 * The v2 router has no route params; selection travels through this module
 * (set immediately before navigating to "skill-detail").
 */

let selectedSlug: string | null = null;
let navigate: ((view: string) => void) | null = null;

export function setSelectedSkillSlug(slug: string): void {
  selectedSlug = slug;
}

export function getSelectedSkillSlug(): string | null {
  return selectedSlug;
}

export function registerEosNavigate(fn: (view: string) => void): void {
  navigate = fn;
}

export function eosNavigate(view: string): void {
  navigate?.(view);
}
