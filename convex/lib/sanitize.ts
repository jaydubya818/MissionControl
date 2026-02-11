/**
 * Input sanitization for untrusted DM/webhook input.
 * OpenClaw-aligned: treat inbound DMs and webhook payloads as untrusted.
 */

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 50_000;
const MAX_MESSAGE_CONTENT_LENGTH = 10_000;

/** Strip control characters (0x00-0x1F except \t \n \r) */
function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

/** Truncate to max length and strip control chars */
function sanitizeText(
  input: string,
  maxLength: number,
  trim = true
): string {
  if (typeof input !== "string") return "";
  let out = stripControlChars(input);
  if (trim) out = out.trim();
  if (out.length > maxLength) out = out.slice(0, maxLength);
  return out;
}

/**
 * Sanitize task title from external source (Telegram, GitHub, API).
 */
export function sanitizeTaskTitle(title: string): string {
  return sanitizeText(title, MAX_TITLE_LENGTH);
}

/**
 * Sanitize task description from external source.
 */
export function sanitizeTaskDescription(description: string | undefined): string | undefined {
  if (description == null || description === "") return undefined;
  return sanitizeText(description, MAX_DESCRIPTION_LENGTH);
}

/**
 * Sanitize message content (e.g. thread reply from Telegram).
 */
export function sanitizeMessageContent(content: string): string {
  return sanitizeText(content, MAX_MESSAGE_CONTENT_LENGTH);
}
