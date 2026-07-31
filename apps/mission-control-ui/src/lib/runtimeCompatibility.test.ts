import { describe, expect, it } from "vitest";
import {
  evaluateRuntimeCompatibility,
  isRuntimeContractError,
  shouldBypassRuntimeCompatibility,
} from "./runtimeCompatibility";

describe("runtime compatibility", () => {
  it("waits until the backend contract is available", () => {
    expect(evaluateRuntimeCompatibility(1, undefined)).toEqual({ status: "CHECKING" });
  });

  it("allows an exact contract match", () => {
    expect(evaluateRuntimeCompatibility(1, 1)).toEqual({ status: "COMPATIBLE" });
  });

  it.each([
    [1, 2],
    [2, 1],
  ])("requires reload for client v%s and backend v%s", (clientVersion, serverVersion) => {
    expect(evaluateRuntimeCompatibility(clientVersion, serverVersion)).toEqual({
      status: "RELOAD_REQUIRED",
      clientVersion,
      serverVersion,
    });
  });
});

describe("runtime compatibility E2E bypass", () => {
  it("allows the explicit bypass only in development", () => {
    expect(shouldBypassRuntimeCompatibility(true, "true")).toBe(true);
    expect(shouldBypassRuntimeCompatibility(false, "true")).toBe(false);
  });

  it("keeps the gate enabled by default", () => {
    expect(shouldBypassRuntimeCompatibility(true, undefined)).toBe(false);
    expect(shouldBypassRuntimeCompatibility(true, "false")).toBe(false);
  });
});

describe("runtime contract error classification", () => {
  it.each([
    "ArgumentValidationError: invalid arguments",
    "Object contains extra field complexity",
    "Could not find public function for runtimeCompatibility:get",
    "Found ID from tasks which does not match the table name in validator",
    "Value does not match validator v.object",
  ])("classifies Convex contract failures: %s", (message) => {
    expect(isRuntimeContractError(new Error(message))).toBe(true);
  });

  it("keeps unrelated render failures on the generic recovery path", () => {
    expect(isRuntimeContractError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});
