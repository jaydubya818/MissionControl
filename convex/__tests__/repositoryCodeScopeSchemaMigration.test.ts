import { describe, expect, it } from "vitest";
import { planLegacyScopeMigration } from "../migrations/cleanupRepositoryCodeScopeSchema";

describe("repository code-scope schema migration", () => {
  it("preserves legacy policy context as the canonical description", () => {
    expect(
      planLegacyScopeMigration({
        approvalPolicy: "HUMAN_REVIEW",
        approvalPolicyDescription:
          "Human approval is required before dispatch and before publication.",
      })
    ).toEqual({
      status: "MIGRATE",
      approvalPolicy: "HUMAN_REVIEW",
      description:
        "Human approval is required before dispatch and before publication.",
    });
  });

  it("drops a duplicate legacy value without changing canonical fields", () => {
    expect(
      planLegacyScopeMigration({
        description: "Human approval required.",
        approvalPolicy: "HUMAN_REVIEW",
        approvalPolicyDescription: "Human approval required.",
      })
    ).toEqual({
      status: "MIGRATE",
      description: "Human approval required.",
      approvalPolicy: "HUMAN_REVIEW",
    });
  });

  it("uses the approval policy when description is already occupied", () => {
    expect(
      planLegacyScopeMigration({
        description: "Browser evidence scope.",
        approvalPolicyDescription: "Human approval required.",
      })
    ).toEqual({
      status: "MIGRATE",
      description: "Browser evidence scope.",
      approvalPolicy: "Human approval required.",
    });
  });

  it("blocks a lossy canonical conflict", () => {
    expect(
      planLegacyScopeMigration({
        description: "Browser evidence scope.",
        approvalPolicy: "HUMAN_REVIEW",
        approvalPolicyDescription: "Separate legacy policy context.",
      })
    ).toEqual({
      status: "CONFLICT",
      reason:
        "Legacy approval policy text differs from both canonical description and approval policy.",
    });
  });

  it("is unchanged after the legacy field is removed", () => {
    expect(
      planLegacyScopeMigration({
        description: "Human approval required.",
        approvalPolicy: "HUMAN_REVIEW",
      })
    ).toEqual({ status: "UNCHANGED" });
  });
});
