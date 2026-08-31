import { useAuth } from "@clerk/react";
import { useCallback, useMemo, useRef } from "react";
import type { ClerkTokenFetcher } from "./clerkConvexDiagnostic";

export type ConvexAccessTokenFetcher = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null>;

export function createNativeConvexAccessTokenFetcher(
  getToken: ClerkTokenFetcher,
): ConvexAccessTokenFetcher {
  return async ({ forceRefreshToken }) => {
    try {
      return await getToken({ skipCache: forceRefreshToken });
    } catch {
      return null;
    }
  };
}

/**
 * Mission Control requires Clerk's native Convex integration. Fetch the
 * audience-qualified session token directly so a late sessionClaims hydration
 * cannot make the client fall back to a legacy JWT template.
 */
export function useNativeClerkConvexAuth() {
  const {
    getToken,
    isLoaded,
    isSignedIn,
    orgId,
    orgRole,
    sessionId,
  } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return await getTokenRef.current({ skipCache: forceRefreshToken });
      } catch {
        return null;
      }
    },
    [orgId, orgRole, sessionId],
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [fetchAccessToken, isLoaded, isSignedIn],
  );
}
