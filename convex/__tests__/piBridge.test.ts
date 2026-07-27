import { describe, expect, it } from "vitest";
import { validateReceiptPacket } from "../lib/piBridgeEnvelope";

describe("validateReceiptPacket", () => {
  const workOrder = {
    acceptanceCriteria: [{ id: "ac-pi-session" }, { id: "ac-receipts" }],
    state: "IN_PROGRESS",
  };
  const run = { workOrderId: "wo1", status: "RUNNING" };

  it("requires pi session or execution id", () => {
    expect(() =>
      validateReceiptPacket({
        workOrder,
        run,
        receipts: [{ acceptanceCriterionId: "ac-pi-session", status: "PASSED" }],
      })
    ).toThrow(/piSessionId or piExecutionId/);
  });

  it("requires at least one receipt", () => {
    expect(() =>
      validateReceiptPacket({
        workOrder,
        run,
        receipts: [],
        piSessionId: "sess-1",
      })
    ).toThrow(/at least one verification receipt/);
  });

  it("rejects unknown acceptance criteria", () => {
    expect(() =>
      validateReceiptPacket({
        workOrder,
        run,
        receipts: [{ acceptanceCriterionId: "ac-unknown", status: "PASSED" }],
        piSessionId: "sess-1",
      })
    ).toThrow(/Unknown acceptance criterion/);
  });

  it("accepts a valid packet", () => {
    expect(() =>
      validateReceiptPacket({
        workOrder,
        run,
        piSessionId: "sess-1",
        receipts: [
          { acceptanceCriterionId: "ac-pi-session", status: "PASSED" },
          { acceptanceCriterionId: "ac-receipts", status: "PASSED" },
        ],
      })
    ).not.toThrow();
  });
});
