import { describe, expect, it } from "vitest";
import { decideExecutionIntentIntake } from "../lib/executionIntentShadow.js";

const existing = {
  intentId: "executionIntent_shadow1",
  idempotencyKey: "shadow-canary-intent-v1",
  requestDigest: `sha256:${"a".repeat(64)}`,
};

describe("durable ExecutionIntent shadow policy", () => {
  it("creates only when neither immutable identity already exists", () => {
    expect(decideExecutionIntentIntake(null, null, existing)).toBe("CREATE");
  });

  it("deduplicates exact identity and conflicts on any immutable drift", () => {
    expect(decideExecutionIntentIntake(existing, existing, existing)).toBe(
      "DUPLICATE",
    );
    expect(
      decideExecutionIntentIntake(existing, existing, {
        ...existing,
        requestDigest: `sha256:${"b".repeat(64)}`,
      }),
    ).toBe("CONFLICT");
    expect(
      decideExecutionIntentIntake(existing, null, {
        ...existing,
        intentId: "executionIntent_other1",
      }),
    ).toBe("CONFLICT");
    expect(
      decideExecutionIntentIntake(null, existing, {
        ...existing,
        idempotencyKey: "another-idempotency-key",
      }),
    ).toBe("CONFLICT");
  });
});
