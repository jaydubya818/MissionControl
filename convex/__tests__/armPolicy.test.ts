import { describe, expect, it } from "vitest";
import { evaluatePolicyEnvelopes } from "../lib/armPolicy";
import { evaluateLegacyToolPolicy } from "../lib/legacyToolPolicy";

function makeEnvelopeDb(rows: any[]) {
  return {
    query: (_table: string) => ({
      withIndex: (index: string, cb: (q: any) => any) => {
        const capture = cb({
          eq: (_field: string, value: any) => ({ value }),
        });
        const value = capture?.value;

        return {
          collect: async () => {
            if (index === "by_version") {
              return rows.filter((row) => row.versionId === value);
            }
            if (index === "by_project") {
              return rows.filter((row) => row.projectId === value);
            }
            if (index === "by_tenant") {
              return rows.filter((row) => row.tenantId === value);
            }
            return rows;
          },
        };
      },
    }),
  };
}

describe("ARM policy envelope precedence", () => {
  it("prefers version scope over project and tenant", async () => {
    const db = makeEnvelopeDb([
      {
        _id: "tenant-env",
        tenantId: "tenant-1",
        active: true,
        priority: 10,
        name: "Tenant Policy",
        rules: { defaultDecision: "ALLOW" },
      },
      {
        _id: "project-env",
        projectId: "project-1",
        active: true,
        priority: 20,
        name: "Project Policy",
        rules: { defaultDecision: "DENY" },
      },
      {
        _id: "version-env",
        versionId: "version-1",
        active: true,
        priority: 30,
        name: "Version Policy",
        rules: { toolPolicies: { shell: "NEEDS_APPROVAL" } },
      },
    ]);

    const result = await evaluatePolicyEnvelopes(db as any, {
      tenantId: "tenant-1",
      projectId: "project-1",
      versionId: "version-1",
      toolName: "shell",
      riskLevel: "YELLOW",
    });

    expect(result?.decision).toBe("NEEDS_APPROVAL");
    expect(result?.source).toBe("version");
    expect(result?.envelope.name).toBe("Version Policy");
  });

  it("falls back to project when no version envelope matches", async () => {
    const db = makeEnvelopeDb([
      {
        _id: "project-env",
        projectId: "project-1",
        active: true,
        priority: 20,
        name: "Project Policy",
        rules: { defaultDecision: "DENY" },
      },
    ]);

    const result = await evaluatePolicyEnvelopes(db as any, {
      tenantId: "tenant-1",
      projectId: "project-1",
      versionId: "version-1",
      toolName: "shell",
      riskLevel: "YELLOW",
    });

    expect(result?.decision).toBe("DENY");
    expect(result?.source).toBe("project");
  });
});

describe("Legacy tool policy fallback", () => {
  it("denies blocked shell commands", () => {
    const result = evaluateLegacyToolPolicy({
      policy: {
        shellBlocklist: ["rm -rf"],
        shellAllowlist: [],
        networkAllowlist: [],
        fileReadPaths: [],
        fileWritePaths: [],
      } as any,
      agentRole: "SPECIALIST",
      budgetRemaining: 10,
      estimatedCost: 0.1,
      toolName: "shell",
      toolArgs: { command: "rm -rf /tmp/test" },
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toContain("blocked pattern");
  });

  it("requires approval for red tools", () => {
    const result = evaluateLegacyToolPolicy({
      policy: {
        shellBlocklist: [],
        shellAllowlist: [],
        networkAllowlist: [],
        fileReadPaths: [],
        fileWritePaths: [],
      } as any,
      agentRole: "SPECIALIST",
      budgetRemaining: 10,
      estimatedCost: 0.1,
      toolName: "send_email",
      toolArgs: {},
    });

    expect(result.decision).toBe("NEEDS_APPROVAL");
    expect(result.riskLevel).toBe("RED");
  });

  it("allows green tools when policy permits", () => {
    const result = evaluateLegacyToolPolicy({
      policy: {
        shellBlocklist: [],
        shellAllowlist: [],
        networkAllowlist: [],
        fileReadPaths: [],
        fileWritePaths: [],
      } as any,
      agentRole: "SPECIALIST",
      budgetRemaining: 10,
      estimatedCost: 0.1,
      toolName: "read_file",
      toolArgs: { path: "docs/readme.md" },
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.riskLevel).toBe("GREEN");
  });
});
