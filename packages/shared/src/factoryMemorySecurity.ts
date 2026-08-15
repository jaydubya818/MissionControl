const SECRET_KEY =
  /(?:^|[_\-.])(authorization|cookie|credential|secret|password|passwd|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token)(?:$|[_\-.])/i;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:proj|org|live|test)?-?[a-z0-9_-]{10,}\b/gi,
  /\bgh[pousr]_[a-z0-9]{10,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(Bearer\s+)[a-z0-9._~+/=-]{8,}/gi,
  /\b(authorization|cookie|credential|secret|password|passwd|api[-_]?key|access[-_]?token|refresh[-_]?token)\s*[:=]\s*([^\s,;]+)/gi,
];

export interface RedactionResult<T> {
  value: T;
  redactionCount: number;
}

export function redactFactoryMemoryText(
  input: string,
  maxLength = 100_000,
): RedactionResult<string> {
  let value = input.slice(0, maxLength);
  let redactionCount = input.length > maxLength ? 1 : 0;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    value = value.replace(pattern, (...match: unknown[]) => {
      redactionCount += 1;
      const prefix = typeof match[1] === "string" ? match[1] : "";
      return prefix &&
        /^(Bearer\s+|authorization|cookie|credential|secret|password|passwd|api[-_]?key|access[-_]?token|refresh[-_]?token)$/i.test(
          prefix,
        )
        ? `${prefix}${prefix.toLowerCase().startsWith("bearer") ? "[REDACTED]" : "=[REDACTED]"}`
        : "[REDACTED]";
    });
  }
  return { value, redactionCount };
}

export function sanitizeFactoryMemoryValue(
  input: unknown,
  depth = 0,
): RedactionResult<unknown> {
  if (input === null || input === undefined || typeof input === "boolean")
    return { value: input, redactionCount: 0 };
  if (typeof input === "number")
    return {
      value: Number.isFinite(input) ? input : undefined,
      redactionCount: 0,
    };
  if (typeof input === "string") return redactFactoryMemoryText(input, 20_000);
  if (depth >= 6) return { value: "[TRUNCATED]", redactionCount: 0 };
  if (Array.isArray(input)) {
    let redactionCount = input.length > 100 ? 1 : 0;
    const value = input.slice(0, 100).map((item) => {
      const sanitized = sanitizeFactoryMemoryValue(item, depth + 1);
      redactionCount += sanitized.redactionCount;
      return sanitized.value;
    });
    return { value, redactionCount };
  }
  if (typeof input === "object") {
    const value: Record<string, unknown> = {};
    let redactionCount = 0;
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length > 100) redactionCount += 1;
    for (const [rawKey, rawValue] of entries.slice(0, 100)) {
      const key = rawKey.slice(0, 200);
      if (SECRET_KEY.test(`.${key}.`)) {
        value[key] = "[REDACTED]";
        redactionCount += 1;
      } else {
        const sanitized = sanitizeFactoryMemoryValue(rawValue, depth + 1);
        value[key] = sanitized.value;
        redactionCount += sanitized.redactionCount;
      }
    }
    return { value, redactionCount };
  }
  return redactFactoryMemoryText(String(input), 2_000);
}

export function containsUnredactedFactoryMemorySecret(input: string): boolean {
  const withoutRedactionMarkers = input.split("[REDACTED]").join("");
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(withoutRedactionMarkers);
  });
}
