import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const implementation = readFileSync(
  new URL("../factoryPackageImports.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../schema.ts", import.meta.url), "utf8");

describe("Factory package import authority boundary", () => {
  it("authenticates both public actions and reauthorizes the atomic write", () => {
    expect(
      implementation.match(/ctx\.auth\.getUserIdentity\(\)/g),
    ).toHaveLength(3);
    expect(implementation).toContain("COMPANY_PERMISSIONS.UPDATE_DELIVERY");
    expect(implementation).toContain("COMPANY_PERMISSIONS.ASSIGN_DELIVERY");
    expect(implementation).toContain(
      "resolveTargetForAuthenticatedOperator(ctx, args)",
    );
    expect(implementation).toContain(
      "scope.allowedEnvironments.includes(args.executionEnvironment)",
    );
    expect(implementation).toContain("scope.owningTeamId !== team._id");
    expect(implementation).toContain('project.status !== "ACTIVE"');
    expect(
      implementation.match(/assertFactoryPackageLocalProjectBinding\(/g),
    ).toHaveLength(3);
    const atomicMutation =
      implementation.match(
        /export const createDraftsAtomic = internalMutation\([\s\S]*?\n\}\);/,
      )?.[0] ?? "";
    expect(atomicMutation).toContain("configuredFactoryProjectId()");
    expect(atomicMutation).toContain("String(target.projectId)");
  });

  it("creates only one Mission and one Plan and has no execution authority", () => {
    expect(implementation.match(/ctx\.db\.insert\("missions"/g)).toHaveLength(
      1,
    );
    expect(
      implementation.match(/ctx\.db\.insert\("missionPlans"/g),
    ).toHaveLength(1);
    for (const forbidden of [
      'ctx.db.insert("workOrders"',
      'ctx.db.insert("tasks"',
      "submitPlan",
      "approvePlan",
      "dispatch",
      "acceptMission",
    ]) {
      expect(implementation).not.toContain(forbidden);
    }
  });

  it("persists issuer-scoped identity and unique lookup indexes atomically", () => {
    expect(schema).toContain("factoryPackageImports: defineTable");
    expect(schema).toContain(
      '.index("by_external_identity", ["issuerId", "packageId", "packageVersion"])',
    );
    expect(schema).toContain('.index("by_mission", ["missionId"])');
    expect(implementation).toContain('withIndex("by_external_identity"');
    expect(implementation).toContain("resolveFactoryPackageImportRetry");
  });

  it("takes package location and credentials only from deployment configuration", () => {
    expect(implementation).toContain("process.env.FACTORY_ENGINEER_BASE_URL");
    expect(implementation).toContain(
      "process.env.FACTORY_ENGINEER_RETRIEVAL_TOKEN",
    );
    expect(implementation).toContain("process.env.FACTORY_ENGINEER_ISSUER_ID");
    expect(implementation).toContain(
      "process.env.FACTORY_ENGINEER_WORKSPACE_REF",
    );
    expect(implementation).toContain("process.env.FACTORY_ENGINEER_PROJECT_ID");
    const targetInputs =
      implementation.match(
        /const targetSelectionFields = \{[\s\S]*?\n\};/,
      )?.[0] ?? "";
    expect(targetInputs).not.toMatch(
      /(?:url|baseUrl|issuerId|bearerToken):\s*v\./,
    );
    expect(targetInputs).not.toBe("");
  });
});
