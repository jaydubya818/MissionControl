import { afterEach, describe, expect, it } from "vitest";

const originalStartupFlag = process.env.ORCHESTRATION_DISABLE_STARTUP;
const originalConvexUrl = process.env.CONVEX_URL;
const originalOrchestrationToken = process.env.ORCHESTRATION_API_TOKEN;

afterEach(() => {
  if (originalStartupFlag === undefined) {
    delete process.env.ORCHESTRATION_DISABLE_STARTUP;
  } else {
    process.env.ORCHESTRATION_DISABLE_STARTUP = originalStartupFlag;
  }
  if (originalConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = originalConvexUrl;
  }
  if (originalOrchestrationToken === undefined) {
    delete process.env.ORCHESTRATION_API_TOKEN;
  } else {
    process.env.ORCHESTRATION_API_TOKEN = originalOrchestrationToken; // secret-scan: allow-fixture
  }
});

describe("local inference catalog boundary", () => {
  it("rejects legacy HTTP synchronization until a signed workspace command exists", async () => {
    process.env.ORCHESTRATION_DISABLE_STARTUP = "1";
    process.env.CONVEX_URL = "http://127.0.0.1:3210";
    process.env.ORCHESTRATION_API_TOKEN = "local-inference-boundary-test"; // secret-scan: allow-fixture
    const { app } = await import("../index.js");

    const response = await app.request("/local-inference/sync", {
      method: "POST",
      headers: { authorization: "Bearer local-inference-boundary-test" }, // secret-scan: allow-fixture
    });

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: "Local model sync requires a signed, workspace-scoped service command.",
    });
  });
});
