/**
 * Pure validation for a persisted mc-context.lock activation request.
 *
 * Activation must never silently substitute the Registry's current version for
 * a lock-pinned version. This parser accepts only the lock shape emitted by
 * `mc-context lock` and preserves the exact pinned hashes for verification.
 */

export interface LockedContextPackage {
  readonly version: string;
  readonly contentHash: string;
  readonly sourceCommitSha?: string;
}

export type ResolvedContextLock = Readonly<Record<string, LockedContextPackage>>;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function parseResolvedContextLock(lockJson: string): ResolvedContextLock {
  let parsed: unknown;
  try {
    parsed = JSON.parse(lockJson);
  } catch {
    throw new Error("Stored context lock is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored context lock must be an object");
  }
  const resolved = (parsed as { resolved?: unknown }).resolved;
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new Error("Stored context lock has no resolved package map");
  }

  const entries: Record<string, LockedContextPackage> = {};
  for (const [slug, value] of Object.entries(resolved)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Stored context lock entry "${slug}" is invalid`);
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.version !== "string" || entry.version.length === 0) {
      throw new Error(`Stored context lock entry "${slug}" has no version`);
    }
    if (typeof entry.contentHash !== "string" || !SHA256_PATTERN.test(entry.contentHash)) {
      throw new Error(`Stored context lock entry "${slug}" has an invalid content hash`);
    }
    entries[slug] = {
      version: entry.version,
      contentHash: entry.contentHash,
      ...(typeof entry.sourceCommitSha === "string" ? { sourceCommitSha: entry.sourceCommitSha } : {}),
    };
  }
  return entries;
}
