import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNativeConvexAccessTokenFetcher,
  useNativeClerkConvexAuth,
} from "./clerkConvexAuth";

const clerkAuth = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@clerk/react", () => ({ useAuth: clerkAuth.useAuth }));

describe("createNativeConvexAccessTokenFetcher", () => {
  it("always fetches the native audience-qualified session token", async () => {
    const getToken = vi.fn().mockResolvedValue("sensitive-token-value");
    const fetchAccessToken = createNativeConvexAccessTokenFetcher(getToken);

    await expect(
      fetchAccessToken({ forceRefreshToken: false }),
    ).resolves.toBe("sensitive-token-value");
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: false });

    await expect(
      fetchAccessToken({ forceRefreshToken: true }),
    ).resolves.toBe("sensitive-token-value");
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });
    expect(getToken).not.toHaveBeenCalledWith(
      expect.objectContaining({ template: "convex" }),
    );
  });

  it("fails closed when Clerk cannot issue a token", async () => {
    const getToken = vi.fn().mockRejectedValue(new Error("token unavailable"));
    const fetchAccessToken = createNativeConvexAccessTokenFetcher(getToken);

    await expect(
      fetchAccessToken({ forceRefreshToken: true }),
    ).resolves.toBeNull();
  });
});

describe("useNativeClerkConvexAuth", () => {
  beforeEach(() => {
    clerkAuth.useAuth.mockReset();
  });

  it("keeps Convex auth stable while using Clerk's latest token getter", async () => {
    const firstGetToken = vi.fn().mockResolvedValue("first-token");
    const secondGetToken = vi.fn().mockResolvedValue("second-token");
    const authState = {
      getToken: firstGetToken,
      isLoaded: true,
      isSignedIn: true,
      orgId: null,
      orgRole: null,
      sessionId: "session-1",
    };
    clerkAuth.useAuth.mockImplementation(() => authState);

    const { result, rerender } = renderHook(() => useNativeClerkConvexAuth());
    const firstFetcher = result.current.fetchAccessToken;

    authState.getToken = secondGetToken;
    rerender();

    expect(result.current.fetchAccessToken).toBe(firstFetcher);
    await expect(
      result.current.fetchAccessToken({ forceRefreshToken: true }),
    ).resolves.toBe("second-token");
    expect(firstGetToken).not.toHaveBeenCalled();
    expect(secondGetToken).toHaveBeenCalledWith({ skipCache: true });
  });
});
