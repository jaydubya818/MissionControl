export type ClerkTokenFetcher = (options?: {
  template?: string;
  skipCache?: boolean;
}) => Promise<string | null>;

export type ClerkConvexTokenSource = "session" | "template";

export type ClerkConvexTokenProbe =
  | { status: "issued"; source: ClerkConvexTokenSource }
  | { status: "missing"; source: ClerkConvexTokenSource }
  | { status: "error"; source: ClerkConvexTokenSource; errorCode: string };

export function resolveClerkConvexTokenSource(
  sessionClaims: unknown,
): ClerkConvexTokenSource {
  if (!sessionClaims || typeof sessionClaims !== "object") return "template";

  return (sessionClaims as { aud?: unknown }).aud === "convex"
    ? "session"
    : "template";
}

function sanitizeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown_error";

  const candidate = error as {
    code?: unknown;
    errors?: Array<{ code?: unknown }>;
  };
  const nestedCode = candidate.errors?.[0]?.code;
  const rawCode =
    typeof nestedCode === "string"
      ? nestedCode
      : typeof candidate.code === "string"
        ? candidate.code
        : "unknown_error";
  const safeCode = rawCode.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);

  return safeCode || "unknown_error";
}

export async function probeClerkConvexToken({
  getToken,
  sessionClaims,
}: {
  getToken: ClerkTokenFetcher;
  sessionClaims: unknown;
}): Promise<ClerkConvexTokenProbe> {
  const source = resolveClerkConvexTokenSource(sessionClaims);

  try {
    const token = await getToken(
      source === "session"
        ? { skipCache: true }
        : { template: "convex", skipCache: true },
    );

    return token ? { status: "issued", source } : { status: "missing", source };
  } catch (error) {
    return {
      status: "error",
      source,
      errorCode: sanitizeErrorCode(error),
    };
  }
}
