/**
 * Outbound URL policy for control-plane initiated HTTP requests.
 *
 * Any destination that Mission Control will call with its own identity is a
 * server-side request forgery primitive if an operator (or an attacker who
 * reached an unauthorized mutation) can point it at an internal address. The
 * public-host predicate is shared with the research source policy so both
 * paths reject the same set of loopback, private, reserved, and non-routable
 * hosts.
 *
 * Pure functions only — no Convex imports — so the rules stay unit testable.
 */

import { isPublicResearchHostname } from "./researchSourcePolicy";

export interface OutboundUrlDecision {
  /** Normalized URL string, present only when `errors` is empty. */
  url?: string;
  errors: string[];
}

/**
 * Validate a destination Mission Control will POST to (webhooks, gateways).
 *
 * Fails closed: an unparseable, non-HTTPS, credentialed, non-standard-port, or
 * non-public destination is rejected rather than normalized.
 */
export function validateOutboundUrl(candidate: string): OutboundUrlDecision {
  const errors: string[] = [];
  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    return { errors: ["Destination must be an absolute URL."] };
  }
  if (url.protocol !== "https:") {
    errors.push("Only HTTPS destinations are permitted.");
  }
  if (url.username || url.password) {
    errors.push("Credentials must not appear in a destination URL.");
  }
  if (url.port && url.port !== "443") {
    errors.push("Only the standard HTTPS port is permitted.");
  }
  if (!isPublicResearchHostname(url.hostname)) {
    errors.push("Local, private, reserved, and non-routable hosts are not permitted.");
  }
  if (errors.length > 0) return { errors };
  url.hash = "";
  return { url: url.toString(), errors };
}

/** Throwing wrapper for mutation handlers. Returns the normalized URL. */
export function requireOutboundUrl(candidate: string, label = "Destination"): string {
  const decision = validateOutboundUrl(candidate);
  if (!decision.url) {
    throw new Error(`${label} rejected: ${decision.errors.join(" ")}`);
  }
  return decision.url;
}

/**
 * Schemes that are safe to render as a link `href` or hand to `window.open`.
 *
 * Agent output, repository content, and operator-supplied artifact locations
 * are untrusted; `javascript:` and `data:` hrefs execute in the operator's
 * session. Returns `null` when the candidate must not be linked.
 */
export function safeLinkHref(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(String(candidate).trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.toString();
}
