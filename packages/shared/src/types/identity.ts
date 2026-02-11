/**
 * Identity/Soul/Tools Types
 *
 * OpenClaw-aligned agent identity governance types.
 */

export type ValidationStatus = "VALID" | "INVALID" | "MISSING" | "PARTIAL";

export interface AgentIdentity {
  _id: string;
  _creationTime: number;
  agentId: string;

  // IDENTITY.md fields
  name: string;
  creature?: string;
  vibe?: string;
  emoji?: string;
  avatarPath?: string;

  // SOUL.md content
  soulContent?: string;
  soulHash?: string;

  // TOOLS.md content
  toolsNotes?: string;

  // Validation
  validationStatus: ValidationStatus;
  validationErrors?: string[];
  lastScannedAt?: number;

  metadata?: Record<string, any>;
}

export interface IdentityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IdentityRequiredFields {
  name: boolean;
  creature: boolean;
  vibe: boolean;
  emoji: boolean;
}

/**
 * Validates an avatar path per OpenClaw rules:
 * - workspace-relative path (e.g., "avatars/agent.png")
 * - http(s) URL
 * - data URI
 */
export function isValidAvatarPath(path: string): boolean {
  if (!path || path.trim().length === 0) return false;
  // http(s) URL
  if (/^https?:\/\//.test(path)) return true;
  // data URI
  if (/^data:/.test(path)) return true;
  // workspace-relative path (no leading slash, no ..)
  if (/^[a-zA-Z0-9_\-./]+$/.test(path) && !path.startsWith("/") && !path.includes("..")) return true;
  return false;
}

/**
 * Validates an emoji (single emoji character or short emoji sequence).
 */
export function isValidEmoji(emoji: string): boolean {
  if (!emoji || emoji.trim().length === 0) return false;
  // Allow 1-4 unicode characters (covers emoji + modifiers)
  return emoji.length >= 1 && emoji.length <= 8;
}
