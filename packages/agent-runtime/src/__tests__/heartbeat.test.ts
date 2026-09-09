import { afterEach, describe, expect, it, vi } from "vitest";
import { isAgentStale } from "../heartbeat.js";

describe("isAgentStale", () => {
  const THRESHOLD_MS = 60_000; // 60 seconds

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when lastHeartbeatAt is undefined", () => {
    expect(isAgentStale(undefined, THRESHOLD_MS)).toBe(true);
  });

  it("returns true when heartbeat is older than threshold", () => {
    const oldHeartbeat = Date.now() - 120_000; // 2 minutes ago
    expect(isAgentStale(oldHeartbeat, THRESHOLD_MS)).toBe(true);
  });

  it("returns false when heartbeat is recent", () => {
    const recentHeartbeat = Date.now() - 10_000; // 10 seconds ago
    expect(isAgentStale(recentHeartbeat, THRESHOLD_MS)).toBe(false);
  });

  it("returns false when heartbeat is exactly at threshold", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const exactlyAtThreshold = now - THRESHOLD_MS;
    // At exactly the threshold, it should not be stale (not strictly greater)
    expect(isAgentStale(exactlyAtThreshold, THRESHOLD_MS)).toBe(false);
  });

  it("returns true when heartbeat is 1ms past threshold", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const justPastThreshold = now - THRESHOLD_MS - 1;
    expect(isAgentStale(justPastThreshold, THRESHOLD_MS)).toBe(true);
  });
});
