import { expect, it } from "vitest";
import { dockerTerminalState } from "../dockerTerminalState.js";
const result = (status: string) =>
  Buffer.from(
    JSON.stringify({
      schema: "factory-sandbox-result/v1",
      status,
      structuredResult: { status },
    }),
  );
it.each([
  ["COMPLETED", "SUCCESS"],
  ["FAILED", "WORKLOAD_FAILURE"],
  ["CANCELED", "CANCELED"],
  ["TIMED_OUT", "TIMEOUT"],
  ["unknown", "INVALID_REQUEST"],
])("reports %s as %s", (status, expected) => {
  expect(
    dockerTerminalState({
      canceled: false,
      exitCode: 0,
      result: result(status),
    }),
  ).toBe(expected);
});
it.each(["TIMEOUT", "FENCED", "BUDGET_DENIED", "POLICY_DENIED"] as const)(
  "late success preserves %s",
  (prior) => {
    expect(
      dockerTerminalState({
        prior,
        canceled: true,
        exitCode: 0,
        result: result("COMPLETED"),
      }),
    ).toBe(prior);
  },
);
it("cancellation suppresses late success", () =>
  expect(
    dockerTerminalState({
      canceled: true,
      exitCode: 0,
      result: result("COMPLETED"),
    }),
  ).toBe("CANCELED"));
it.each([
  Buffer.from("invalid"),
  Buffer.from("{}"),
  Buffer.from("null"),
  Buffer.from('{"schema":"factory-sandbox-result/v1","status":"COMPLETED"}'),
])("rejects malformed diagnostics", (payload) =>
  expect(
    dockerTerminalState({ canceled: false, exitCode: 0, result: payload }),
  ).toBe("INVALID_REQUEST"),
);
it.each([1, null])("process failure cannot report success (%s)", (exitCode) =>
  expect(
    dockerTerminalState({
      canceled: false,
      exitCode,
      result: result("COMPLETED"),
    }),
  ).toBe("INFRASTRUCTURE_FAILURE"),
);
it("reports deadline exit", () =>
  expect(dockerTerminalState({ canceled: false, exitCode: 124 })).toBe(
    "TIMEOUT",
  ));
it("preserves transport failure", () =>
  expect(
    dockerTerminalState({
      canceled: false,
      exitCode: 0,
      failure: "transport",
      result: result("COMPLETED"),
    }),
  ).toBe("INFRASTRUCTURE_FAILURE"));
