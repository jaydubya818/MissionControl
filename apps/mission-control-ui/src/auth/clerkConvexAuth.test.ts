import { describe, expect, it, vi } from "vitest";
import { createNativeConvexAccessTokenFetcher } from "./clerkConvexAuth";

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
