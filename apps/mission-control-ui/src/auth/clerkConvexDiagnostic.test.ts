import { describe, expect, it, vi } from "vitest";
import {
  probeClerkConvexToken,
  resolveClerkConvexTokenSource,
} from "./clerkConvexDiagnostic";

describe("resolveClerkConvexTokenSource", () => {
  it("uses the default session token only for the exact Convex audience", () => {
    expect(resolveClerkConvexTokenSource({ aud: "convex" })).toBe("session");
    expect(resolveClerkConvexTokenSource({ aud: ["convex"] })).toBe("template");
    expect(resolveClerkConvexTokenSource({})).toBe("template");
  });
});

describe("probeClerkConvexToken", () => {
  it("checks the default session-token path without retaining the token", async () => {
    const getToken = vi.fn().mockResolvedValue("sensitive-token-value");

    await expect(
      probeClerkConvexToken({ getToken, sessionClaims: { aud: "convex" } }),
    ).resolves.toEqual({ status: "issued", source: "session" });
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it("checks the legacy template path when the audience is absent", async () => {
    const getToken = vi.fn().mockResolvedValue(null);

    await expect(
      probeClerkConvexToken({ getToken, sessionClaims: {} }),
    ).resolves.toEqual({ status: "missing", source: "template" });
    expect(getToken).toHaveBeenCalledWith({
      template: "convex",
      skipCache: true,
    });
  });

  it("exposes only a bounded error code", async () => {
    const getToken = vi.fn().mockRejectedValue({
      errors: [{ code: "template-missing <private detail>" }],
    });

    await expect(
      probeClerkConvexToken({ getToken, sessionClaims: null }),
    ).resolves.toEqual({
      status: "error",
      source: "template",
      errorCode: "template-missingprivatedetail",
    });
  });
});
