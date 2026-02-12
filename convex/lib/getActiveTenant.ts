/**
 * ARM: Tenant Resolution
 * 
 * Resolves the active tenant from auth/session context.
 * 
 * Phase 1: Stub implementation returns default tenant.
 * Future: Resolve from Convex auth context or session.
 */

import { Id } from "../_generated/dataModel";

/**
 * Get the active tenant ID for the current request.
 * 
 * @returns Tenant ID (currently returns stub default tenant)
 */
export function getActiveTenant(): Id<"tenants"> | null {
  // Phase 1 stub: Return null (will be replaced with default tenant lookup)
  // Future: Parse from auth context, session, or request headers
  return null;
}

/**
 * Get the default tenant ID (for migration).
 * 
 * This should be called during migration to assign existing
 * projects to a default tenant.
 * 
 * @returns Default tenant ID or null if not yet created
 */
export function getDefaultTenantId(): Id<"tenants"> | null {
  // Phase 1 stub: Return null
  // Will be populated after tenant seed/migration
  return null;
}
